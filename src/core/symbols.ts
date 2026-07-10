import type { Node } from "web-tree-sitter";
import { findBuiltinFunction, findBuiltinObjectMacro, findBuiltinTypedef } from "./builtins.js";
import {
  textRange,
  type ParseConcern,
  type SourceDoc,
  type SymbolKind,
  type SymbolOccurrence,
  type SymbolRecord,
  type SymbolSnapshot,
  type TextRange,
} from "./model.js";

interface MutableSymbol {
  readonly id: string;
  readonly name: string;
  readonly kind: SymbolKind;
  readonly declarationRanges: TextRange[];
  confidence: SymbolRecord["confidence"];
  readonly header?: string;
  readonly signatureText?: string;
  readonly valueText?: string;
  readonly description?: string;
}

interface Scope {
  readonly parent: Scope | null;
  readonly symbols: Map<string, MutableSymbol>;
  readonly isFile: boolean;
}

interface Resolution {
  readonly symbol: MutableSymbol;
  readonly resolution: SymbolOccurrence["resolution"];
}

interface TypeInspection {
  readonly suspiciousVariableType: boolean;
  readonly confidence: SymbolRecord["confidence"];
}

export interface SymbolProjection {
  readonly snapshot: SymbolSnapshot;
  readonly concerns: readonly ParseConcern[];
}

export function projectSymbols(source: string, rootNode: Node): SymbolProjection {
  const analyzer = new SymbolAnalyzer(source);
  analyzer.visit(rootNode, analyzer.fileScope);
  return analyzer.finish();
}

export function symbolAt(snapshot: SymbolSnapshot, offset: number): SymbolRecord | null {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError(`symbol offset 必须是非负 UTF-16 安全整数，实际 ${String(offset)}`);
  }
  let low = 0;
  let high = snapshot.occurrences.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((snapshot.occurrences[middle]?.range.from ?? Number.POSITIVE_INFINITY) <= offset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  for (let index = low - 1; index >= 0; index -= 1) {
    const occurrence = snapshot.occurrences[index];
    if (occurrence === undefined || occurrence.range.to <= offset) {
      break;
    }
    if (occurrence.range.from <= offset && offset < occurrence.range.to) {
      return snapshot.symbols.find((symbol) => symbol.id === occurrence.symbolId) ?? null;
    }
  }
  return null;
}

export function rangesForSymbol(snapshot: SymbolSnapshot, symbolId: string): readonly TextRange[] {
  if (!snapshot.symbols.some((symbol) => symbol.id === symbolId)) {
    throw new TypeError("symbol id 不属于当前 snapshot");
  }
  return Object.freeze(
    snapshot.occurrences
      .filter((occurrence) => occurrence.symbolId === symbolId)
      .map((occurrence) => occurrence.range),
  );
}

class SymbolAnalyzer {
  readonly fileScope: Scope = createScope(null, true);
  readonly #source: string;
  readonly #symbols: MutableSymbol[] = [];
  readonly #occurrences: SymbolOccurrence[] = [];
  readonly #concerns: ParseConcern[] = [];
  readonly #userMacros = new Map<string, MutableSymbol>();
  readonly #builtinSymbols = new Map<string, MutableSymbol>();
  readonly #unknownSymbols = new Map<string, MutableSymbol>();
  readonly #declarationNodes = new WeakSet<object>();
  #nextSymbolId = 0;

  constructor(source: string) {
    this.#source = source;
  }

  visit(node: Node, scope: Scope): void {
    if (!isUsableNode(node, this.#source.length) || node.type === "comment") {
      return;
    }
    switch (node.type) {
      case "translation_unit":
      case "preproc_ifdef":
      case "preproc_else":
        this.visitChildren(node, scope);
        return;
      case "preproc_if":
      case "preproc_elif":
      case "preproc_function_def":
        return;
      case "preproc_def":
        this.declareObjectMacro(node);
        return;
      case "function_definition":
        this.visitFunction(node);
        return;
      case "compound_statement":
        this.visitChildren(node, createScope(scope, false));
        return;
      case "declaration":
        this.visitDeclaration(node, scope);
        return;
      case "type_definition":
        this.visitTypeDefinition(node, scope);
        return;
      case "enumerator":
        this.visitEnumerator(node, scope);
        return;
      case "for_statement":
        this.visitForStatement(node, scope);
        return;
      case "field_expression": {
        const argument = node.childForFieldName("argument");
        if (argument !== null) {
          this.visit(argument, scope);
        }
        return;
      }
      case "call_expression":
        this.recordTypedefCallConcern(node, scope);
        this.visitChildren(node, scope);
        return;
      case "identifier":
      case "type_identifier":
      case "null":
        if (!this.#declarationNodes.has(node)) {
          this.recordUse(node, scope);
        }
        return;
      case "field_identifier":
      case "statement_identifier":
        return;
      default:
        this.visitChildren(node, scope);
    }
  }

  finish(): SymbolProjection {
    const symbols = Object.freeze(this.#symbols.map(freezeSymbol));
    const occurrences = Object.freeze(
      [...this.#occurrences].sort(
        (left, right) =>
          left.range.from - right.range.from ||
          left.range.to - right.range.to ||
          left.role.localeCompare(right.role),
      ),
    );
    const concerns = Object.freeze(
      [...this.#concerns].sort(
        (left, right) =>
          left.evidenceRange.from - right.evidenceRange.from ||
          left.evidenceRange.to - right.evidenceRange.to ||
          left.code.localeCompare(right.code),
      ),
    );
    return Object.freeze({
      snapshot: Object.freeze({ symbols, occurrences }),
      concerns,
    });
  }

  private visitChildren(node: Node, scope: Scope): void {
    for (const child of node.namedChildren) {
      this.visit(child, scope);
    }
  }

  private visitFunction(node: Node): void {
    const declarator = node.childForFieldName("declarator");
    const nameNode = declarator === null ? null : declaratorName(declarator);
    if (nameNode !== null && isUsableNode(nameNode, this.#source.length)) {
      const symbol = this.declare(
        this.fileScope,
        nodeText(this.#source, nameNode),
        "function",
        nodeRange(nameNode),
        "certain",
      );
      this.#declarationNodes.add(nameNode);
      this.recordOccurrence(symbol, nodeRange(nameNode), "declaration", "file");
    }

    const returnType = node.childForFieldName("type");
    if (returnType !== null) {
      this.inspectType(returnType, this.fileScope, node);
    }

    const functionScope = createScope(this.fileScope, false);
    if (declarator !== null && nameNode !== null) {
      for (const parameter of directFunctionParameters(declarator, nameNode)) {
        this.visitParameter(parameter, functionScope);
      }
    }
    for (const child of node.namedChildren) {
      if (
        (declarator !== null && sameNode(child, declarator)) ||
        (returnType !== null && sameNode(child, returnType)) ||
        child.type === "parameter_declaration"
      ) {
        continue;
      }
      this.visit(child, functionScope);
    }
  }

  private visitParameter(node: Node, scope: Scope): void {
    const type = node.childForFieldName("type");
    if (type !== null) {
      this.inspectType(type, scope, node);
    }
    const declarator = node.childForFieldName("declarator");
    if (declarator === null) {
      return;
    }
    const nameNode = declaratorName(declarator);
    if (nameNode === null || !isUsableNode(nameNode, this.#source.length)) {
      return;
    }
    const symbol = this.declare(
      scope,
      nodeText(this.#source, nameNode),
      "parameter",
      nodeRange(nameNode),
      "certain",
    );
    this.#declarationNodes.add(nameNode);
    this.recordOccurrence(symbol, nodeRange(nameNode), "declaration", "local");
    this.visitDeclaratorRemainder(declarator, nameNode, scope);
  }

  private visitDeclaration(node: Node, scope: Scope): void {
    const type = node.childForFieldName("type");
    const inspection =
      type === null
        ? ({ suspiciousVariableType: false, confidence: "certain" } as const)
        : this.inspectType(type, scope, node);
    const declarators = node.childrenForFieldName("declarator");
    for (const declarator of declarators) {
      const nameNode = declaratorName(declarator);
      if (nameNode === null || !isUsableNode(nameNode, this.#source.length)) {
        this.visit(declarator, scope);
        continue;
      }
      if (inspection.suspiciousVariableType) {
        this.visit(declarator, scope);
        continue;
      }

      const isFunction = declaratorDeclaresFunction(declarator, nameNode);
      const declarationScope = isFunction ? this.fileScope : scope;
      const kind: SymbolKind = isFunction
        ? "function"
        : scope.isFile
          ? "file-variable"
          : "local-variable";
      const symbol = this.declare(
        declarationScope,
        nodeText(this.#source, nameNode),
        kind,
        nodeRange(nameNode),
        inspection.confidence,
      );
      this.#declarationNodes.add(nameNode);
      this.recordOccurrence(
        symbol,
        nodeRange(nameNode),
        "declaration",
        declarationScope.isFile ? "file" : "local",
      );
      this.visitDeclaratorRemainder(declarator, nameNode, scope);
    }
  }

  private visitTypeDefinition(node: Node, scope: Scope): void {
    const type = node.childForFieldName("type");
    if (type !== null) {
      this.inspectType(type, scope, node);
    }
    for (const declarator of node.childrenForFieldName("declarator")) {
      const nameNode = declaratorName(declarator);
      if (nameNode === null || !isUsableNode(nameNode, this.#source.length)) {
        continue;
      }
      const symbol = this.declare(
        scope,
        nodeText(this.#source, nameNode),
        "typedef",
        nodeRange(nameNode),
        "certain",
      );
      this.#declarationNodes.add(nameNode);
      this.recordOccurrence(
        symbol,
        nodeRange(nameNode),
        "declaration",
        scope.isFile ? "file" : "local",
      );
      this.visitDeclaratorRemainder(declarator, nameNode, scope);
    }
  }

  private visitEnumerator(node: Node, scope: Scope): void {
    const nameNode = node.childForFieldName("name");
    if (nameNode === null || !isUsableNode(nameNode, this.#source.length)) {
      return;
    }
    const symbol = this.declare(
      scope,
      nodeText(this.#source, nameNode),
      "enum-constant",
      nodeRange(nameNode),
      "certain",
    );
    this.#declarationNodes.add(nameNode);
    this.recordOccurrence(
      symbol,
      nodeRange(nameNode),
      "declaration",
      scope.isFile ? "file" : "local",
    );
    const value = node.childForFieldName("value");
    if (value !== null) {
      this.visit(value, scope);
    }
  }

  private visitForStatement(node: Node, scope: Scope): void {
    const forScope = createScope(scope, false);
    const fields = ["initializer", "condition", "update", "body"] as const;
    for (const field of fields) {
      const child = node.childForFieldName(field);
      if (child !== null) {
        this.visit(child, forScope);
      }
    }
  }

  private inspectType(typeNode: Node, scope: Scope, owner: Node): TypeInspection {
    if (!isUsableNode(typeNode, this.#source.length)) {
      return Object.freeze({ suspiciousVariableType: false, confidence: "low" });
    }
    const name = nodeText(this.#source, typeNode);
    const identifierLike = /^[A-Za-z_]\w*$/u.test(name);
    const lexical = identifierLike ? this.resolveLexical(name, scope) : null;
    if (lexical !== null) {
      this.recordOccurrence(lexical.symbol, nodeRange(typeNode), "use", lexical.resolution);
      const variableAsType =
        lexical.symbol.kind === "parameter" ||
        lexical.symbol.kind === "local-variable" ||
        lexical.symbol.kind === "file-variable";
      if (variableAsType) {
        this.addConcern(
          "variable-used-as-type",
          owner,
          typeNode,
          `“${name}”已绑定为变量，但此处被解析成类型名；请核对原始 C。`,
        );
      }
      const isTypedef =
        lexical.symbol.kind === "typedef" || lexical.symbol.kind === "builtin-typedef";
      const isTypeMacro = lexical.symbol.kind === "object-macro";
      if (!variableAsType && !isTypedef && !isTypeMacro) {
        this.addConcern(
          "unknown-type-name",
          owner,
          typeNode,
          `“${name}”已绑定为${symbolKindForConcern(lexical.symbol.kind)}，不是当前可见的 typedef；请核对原始 C。`,
        );
      }
      return Object.freeze({
        suspiciousVariableType: variableAsType,
        confidence: variableAsType || (!isTypedef && !isTypeMacro) ? "low" : "certain",
      });
    }

    const builtinTypedef = identifierLike ? findBuiltinTypedef(name) : undefined;
    if (builtinTypedef !== undefined) {
      const builtin = this.resolveBuiltin(builtinTypedef.name);
      if (builtin !== null) {
        this.recordOccurrence(builtin, nodeRange(typeNode), "use", "builtin");
      }
      return Object.freeze({ suspiciousVariableType: false, confidence: "certain" });
    }
    if (typeNode.type !== "type_identifier") {
      this.visitTypeChildren(typeNode, scope);
      return Object.freeze({ suspiciousVariableType: false, confidence: "certain" });
    }

    const builtin = this.resolveBuiltin(name);
    if (builtin !== null) {
      this.recordOccurrence(builtin, nodeRange(typeNode), "use", "builtin");
      this.addConcern(
        "unknown-type-name",
        owner,
        typeNode,
        `“${name}”已绑定为${symbolKindForConcern(builtin.kind)}，不是标准 typedef；请核对原始 C。`,
      );
      return Object.freeze({ suspiciousVariableType: false, confidence: "low" });
    }

    const unknown = this.resolveUnknown(name);
    this.recordOccurrence(unknown.symbol, nodeRange(typeNode), "use", unknown.resolution);
    this.addConcern(
      "unknown-type-name",
      owner,
      typeNode,
      `“${name}”不在当前 typedef 或内置类型表中；该声明按低置信度保留。`,
    );
    return Object.freeze({ suspiciousVariableType: false, confidence: "low" });
  }

  private visitTypeChildren(node: Node, scope: Scope): void {
    if (
      node.type === "struct_specifier" ||
      node.type === "union_specifier" ||
      node.type === "enum_specifier"
    ) {
      for (const child of node.namedChildren) {
        if (child.type !== "type_identifier") {
          this.visit(child, scope);
        }
      }
      return;
    }
    for (const child of node.namedChildren) {
      this.visit(child, scope);
    }
  }

  private visitDeclaratorRemainder(node: Node, nameNode: Node, scope: Scope): void {
    if (sameNode(node, nameNode)) {
      return;
    }
    if (node.type === "parameter_declaration") {
      const type = node.childForFieldName("type");
      if (type !== null) {
        this.inspectType(type, scope, node);
      }
      return;
    }
    for (const child of node.namedChildren) {
      this.visitDeclaratorRemainder(child, nameNode, scope);
    }
    if (
      node.namedChildCount === 0 &&
      (node.type === "identifier" || node.type === "type_identifier") &&
      !this.#declarationNodes.has(node)
    ) {
      this.recordUse(node, scope);
    }
  }

  private declareObjectMacro(node: Node): void {
    const nameNode = node.childForFieldName("name");
    if (nameNode === null || !isUsableNode(nameNode, this.#source.length)) {
      return;
    }
    const name = nodeText(this.#source, nameNode);
    const value = node.childForFieldName("value");
    const symbol = this.createSymbol(name, "object-macro", "certain", {
      valueText: value === null ? "（空替换列表）" : nodeText(this.#source, value),
      description: "当前文件定义的对象式宏。",
    });
    symbol.declarationRanges.push(nodeRange(nameNode));
    this.#userMacros.set(name, symbol);
    this.#declarationNodes.add(nameNode);
    this.recordOccurrence(symbol, nodeRange(nameNode), "declaration", "user-macro");
  }

  private recordUse(node: Node, scope: Scope): void {
    const name = nodeText(this.#source, node);
    if (name.length === 0) {
      return;
    }
    const resolved = this.resolve(name, scope);
    this.recordOccurrence(resolved.symbol, nodeRange(node), "use", resolved.resolution);
  }

  private recordTypedefCallConcern(node: Node, scope: Scope): void {
    const callee = node.childForFieldName("function");
    if (callee === null || callee.type !== "identifier") {
      return;
    }
    const resolved = this.resolveKnown(nodeText(this.#source, callee), scope);
    if (
      resolved !== null &&
      (resolved.symbol.kind === "typedef" || resolved.symbol.kind === "builtin-typedef")
    ) {
      this.addConcern(
        "typedef-used-as-call",
        node,
        callee,
        `“${resolved.symbol.name}”已绑定为 typedef，但此处被解析成函数调用；请核对原始 C。`,
      );
    }
  }

  private declare(
    scope: Scope,
    name: string,
    kind: SymbolKind,
    range: TextRange,
    confidence: SymbolRecord["confidence"],
  ): MutableSymbol {
    const existing = scope.symbols.get(name);
    if (
      existing !== undefined &&
      existing.kind === kind &&
      (kind === "function" || kind === "typedef")
    ) {
      if (!existing.declarationRanges.some((candidate) => sameRange(candidate, range))) {
        existing.declarationRanges.push(range);
      }
      if (existing.confidence === "low" && confidence === "certain") {
        existing.confidence = "certain";
      }
      return existing;
    }
    const symbol = this.createSymbol(name, kind, confidence);
    symbol.declarationRanges.push(range);
    scope.symbols.set(name, symbol);
    return symbol;
  }

  private resolve(name: string, scope: Scope): Resolution {
    return this.resolveKnown(name, scope) ?? this.resolveUnknown(name);
  }

  private resolveKnown(name: string, scope: Scope): Resolution | null {
    const lexical = this.resolveLexical(name, scope);
    if (lexical !== null) {
      return lexical;
    }
    const builtin = this.resolveBuiltin(name);
    return builtin === null ? null : Object.freeze({ symbol: builtin, resolution: "builtin" });
  }

  private resolveLexical(name: string, scope: Scope): Resolution | null {
    let current: Scope | null = scope;
    while (current !== null) {
      const symbol = current.symbols.get(name);
      if (symbol !== undefined) {
        return Object.freeze({ symbol, resolution: current.isFile ? "file" : "local" });
      }
      current = current.parent;
    }
    const macro = this.#userMacros.get(name);
    if (macro !== undefined) {
      return Object.freeze({ symbol: macro, resolution: "user-macro" });
    }
    return null;
  }

  private resolveBuiltin(name: string): MutableSymbol | null {
    const cached = this.#builtinSymbols.get(name);
    if (cached !== undefined) {
      return cached;
    }
    const functionEntry = findBuiltinFunction(name);
    if (functionEntry !== undefined) {
      const symbol = this.createSymbol(name, "builtin-function", "certain", functionEntry);
      this.#builtinSymbols.set(name, symbol);
      return symbol;
    }
    const typedefEntry = findBuiltinTypedef(name);
    if (typedefEntry !== undefined) {
      const symbol = this.createSymbol(name, "builtin-typedef", "certain", typedefEntry);
      this.#builtinSymbols.set(name, symbol);
      return symbol;
    }
    const macroEntry = findBuiltinObjectMacro(name);
    if (macroEntry !== undefined) {
      const symbol = this.createSymbol(name, "builtin-object-macro", "certain", macroEntry);
      this.#builtinSymbols.set(name, symbol);
      return symbol;
    }
    return null;
  }

  private resolveUnknown(name: string): Resolution {
    let symbol = this.#unknownSymbols.get(name);
    if (symbol === undefined) {
      symbol = this.createSymbol(name, "unknown-external", "unknown", {
        description: "当前文件与内置表都没有此名称；按未知外部符号中性显示。",
      });
      this.#unknownSymbols.set(name, symbol);
    }
    return Object.freeze({ symbol, resolution: "unknown" });
  }

  private createSymbol(
    name: string,
    kind: SymbolKind,
    confidence: SymbolRecord["confidence"],
    metadata: {
      readonly header?: string;
      readonly signatureText?: string;
      readonly valueText?: string;
      readonly description?: string;
    } = {},
  ): MutableSymbol {
    const symbol: MutableSymbol = {
      id: `symbol:${this.#nextSymbolId++}:${kind}:${name}`,
      name,
      kind,
      declarationRanges: [],
      confidence,
      ...(metadata.header === undefined ? {} : { header: metadata.header }),
      ...(metadata.signatureText === undefined ? {} : { signatureText: metadata.signatureText }),
      ...(metadata.valueText === undefined ? {} : { valueText: metadata.valueText }),
      ...(metadata.description === undefined ? {} : { description: metadata.description }),
    };
    this.#symbols.push(symbol);
    return symbol;
  }

  private recordOccurrence(
    symbol: MutableSymbol,
    range: TextRange,
    role: SymbolOccurrence["role"],
    resolution: SymbolOccurrence["resolution"],
  ): void {
    this.#occurrences.push(Object.freeze({ symbolId: symbol.id, range, role, resolution }));
  }

  private addConcern(
    code: ParseConcern["code"],
    blockNode: Node,
    evidenceNode: Node,
    message: string,
  ): void {
    const blockRange = nodeRange(blockNode);
    const evidenceRange = nodeRange(evidenceNode);
    this.#concerns.push(
      Object.freeze({ code, confidence: "low", blockRange, evidenceRange, message }),
    );
  }
}

function createScope(parent: Scope | null, isFile: boolean): Scope {
  return { parent, symbols: new Map(), isFile };
}

function declaratorName(node: Node): Node | null {
  if (node.type === "identifier" || node.type === "type_identifier") {
    return node;
  }
  const nested = node.childForFieldName("declarator");
  if (nested !== null) {
    return declaratorName(nested);
  }
  for (const child of node.namedChildren) {
    if (child.type === "parameter_list" || child.type === "argument_list") {
      continue;
    }
    const candidate = declaratorName(child);
    if (candidate !== null) {
      return candidate;
    }
  }
  return null;
}

function declaratorDeclaresFunction(declarator: Node, nameNode: Node): boolean {
  const path = pathToNode(declarator, nameNode);
  if (path === null) {
    return false;
  }
  for (let index = path.length - 2; index >= 0; index -= 1) {
    const node = path[index];
    if (node?.type === "function_declarator") {
      return true;
    }
    if (node?.type === "pointer_declarator" || node?.type === "array_declarator") {
      return false;
    }
  }
  return false;
}

function directFunctionParameters(declarator: Node, nameNode: Node): readonly Node[] {
  const path = pathToNode(declarator, nameNode);
  if (path === null) {
    return [];
  }
  for (let index = path.length - 2; index >= 0; index -= 1) {
    const node = path[index];
    if (node?.type !== "function_declarator") {
      continue;
    }
    const parameters = node.childForFieldName("parameters");
    return parameters === null
      ? []
      : parameters.namedChildren.filter((child) => child.type === "parameter_declaration");
  }
  return [];
}

function pathToNode(root: Node, target: Node): readonly Node[] | null {
  if (sameNode(root, target)) {
    return [root];
  }
  for (const child of root.namedChildren) {
    if (child.startIndex > target.startIndex || child.endIndex < target.endIndex) {
      continue;
    }
    const suffix = pathToNode(child, target);
    if (suffix !== null) {
      return [root, ...suffix];
    }
  }
  return null;
}

function nodeText(source: string, node: Node): string {
  return source.slice(node.startIndex, node.endIndex);
}

function nodeRange(node: Node): TextRange {
  return textRange(node.startIndex, node.endIndex);
}

function sameNode(left: Node, right: Node): boolean {
  return (
    left.type === right.type &&
    left.startIndex === right.startIndex &&
    left.endIndex === right.endIndex
  );
}

function sameRange(left: TextRange, right: TextRange): boolean {
  return left.from === right.from && left.to === right.to;
}

function isUsableNode(node: Node, sourceLength: number): boolean {
  return (
    !node.isMissing &&
    Number.isSafeInteger(node.startIndex) &&
    Number.isSafeInteger(node.endIndex) &&
    node.startIndex >= 0 &&
    node.endIndex > node.startIndex &&
    node.endIndex <= sourceLength
  );
}

function freezeSymbol(symbol: MutableSymbol): SymbolRecord {
  return Object.freeze({
    id: symbol.id,
    name: symbol.name,
    kind: symbol.kind,
    declarationRanges: Object.freeze(
      [...symbol.declarationRanges].sort(
        (left, right) => left.from - right.from || left.to - right.to,
      ),
    ),
    confidence: symbol.confidence,
    ...(symbol.header === undefined ? {} : { header: symbol.header }),
    ...(symbol.signatureText === undefined ? {} : { signatureText: symbol.signatureText }),
    ...(symbol.valueText === undefined ? {} : { valueText: symbol.valueText }),
    ...(symbol.description === undefined ? {} : { description: symbol.description }),
  });
}

function symbolKindForConcern(kind: SymbolKind): string {
  switch (kind) {
    case "function":
    case "builtin-function":
      return "函数";
    case "object-macro":
    case "builtin-object-macro":
      return "对象宏";
    case "unknown-external":
      return "未知外部符号";
    case "parameter":
    case "local-variable":
    case "file-variable":
      return "变量";
    case "enum-constant":
      return "枚举常量";
    case "typedef":
    case "builtin-typedef":
      return "typedef";
  }
}

export type SymbolAwareDocument = Pick<SourceDoc, "symbols" | "concerns">;
