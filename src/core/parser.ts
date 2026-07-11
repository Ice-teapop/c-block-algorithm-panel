import { Language, Parser } from "web-tree-sitter";
import type { Node } from "web-tree-sitter";
import type { SourceDoc } from "./model.js";
import { planConservativeLocalRename, type ConservativeLocalRenamePlan } from "./editing/rename.js";
import {
  extractStatementEditTargets,
  type StatementEditTargetSnapshot,
} from "./editing/statements.js";
import { extractEditTargets, type EditTargetSnapshot } from "./editing/targets.js";
import { projectCst } from "./projector.js";

export interface CParserAssets {
  readonly runtimeWasmUrl: string;
  readonly languageWasm: string | Uint8Array;
}

export interface CAnalysisSnapshot {
  readonly document: SourceDoc;
  readonly editTargets: EditTargetSnapshot;
  readonly statementEdits: StatementEditTargetSnapshot;
}

/**
 * A synchronously borrowed view of the live CST.
 *
 * `rootNode` becomes invalid as soon as the reader returns. Readers must copy
 * only plain immutable values out of it and must never retain the node.
 */
export interface BorrowedCstReadContext {
  readonly source: string;
  readonly revision: number;
  readonly rootNode: Node;
  readonly document: SourceDoc;
}

export interface CParserInspection<T> {
  readonly analysis: CAnalysisSnapshot;
  readonly result: T;
}

/** Pure-value input for a parser-owned local rename analysis. */
export interface LocalRenamePlanningRequest {
  readonly symbolId: string;
  readonly expectedOldName: string;
  readonly newName: string;
}

let initializedRuntimeUrl: string | undefined;
let runtimeInitialization: Promise<void> | undefined;
const languageCache = new Map<string, Promise<Language>>();

export class CParser {
  readonly #parser: Parser;
  #disposed = false;

  private constructor(parser: Parser) {
    this.#parser = parser;
  }

  static async create(assets: CParserAssets): Promise<CParser> {
    await initializeRuntime(assets.runtimeWasmUrl);
    const language = await loadLanguage(assets.languageWasm);
    const parser = new Parser();
    try {
      parser.setLanguage(language);
      return new CParser(parser);
    } catch (error) {
      parser.delete();
      throw error;
    }
  }

  project(source: string): SourceDoc {
    return this.analyze(source, 0).document;
  }

  analyze(source: string, revision: number): CAnalysisSnapshot {
    return this.inspect(source, revision, () => undefined).analysis;
  }

  inspect<T>(
    source: string,
    revision: number,
    reader: (context: BorrowedCstReadContext) => T,
  ): CParserInspection<T> {
    if (this.#disposed) {
      throw new Error("CParser 已释放，不能继续解析");
    }
    const tree = this.#parser.parse(source);
    if (tree === null) {
      throw new Error("tree-sitter 未返回语法树");
    }
    try {
      const analysis = Object.freeze({
        document: projectCst(source, tree.rootNode),
        editTargets: extractEditTargets(tree.rootNode, source, revision),
        statementEdits: extractStatementEditTargets(tree.rootNode, source, revision),
      });
      const result = reader(
        Object.freeze({ source, revision, rootNode: tree.rootNode, document: analysis.document }),
      );
      if (isPromiseLike(result)) {
        throw new TypeError("CST reader 必须同步返回，不能跨越 Tree 生命周期");
      }
      assertDetachedCstResult(result);
      return Object.freeze({ analysis, result });
    } finally {
      tree.delete();
    }
  }

  /**
   * Plans a conservative local rename without allowing a Tree-sitter Node to
   * escape the parser-owned tree lifetime.
   */
  planLocalRename(
    source: string,
    analysis: CAnalysisSnapshot,
    request: LocalRenamePlanningRequest,
  ): ConservativeLocalRenamePlan {
    if (this.#disposed) {
      throw new Error("CParser 已释放，不能继续解析");
    }
    const tree = this.#parser.parse(source);
    if (tree === null) {
      throw new Error("tree-sitter 未返回语法树");
    }
    try {
      return planConservativeLocalRename({
        source,
        rootNode: tree.rootNode,
        analysis: analysis.document,
        symbolId: request.symbolId,
        expectedOldName: request.expectedOldName,
        newName: request.newName,
      });
    } finally {
      tree.delete();
    }
  }

  dispose(): void {
    if (!this.#disposed) {
      this.#disposed = true;
      this.#parser.delete();
    }
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { readonly then?: unknown }).then === "function"
  );
}

function assertDetachedCstResult(value: unknown): void {
  const visited = new Set<object>();
  const active = new Set<object>();

  const visit = (candidate: unknown): void => {
    if (
      candidate === undefined ||
      candidate === null ||
      typeof candidate === "string" ||
      typeof candidate === "boolean" ||
      (typeof candidate === "number" && Number.isFinite(candidate))
    ) {
      return;
    }
    if (typeof candidate !== "object") {
      throw new TypeError("CST reader 只能返回纯冻结值");
    }
    if (active.has(candidate)) {
      throw new TypeError("CST reader 返回值不得包含循环引用");
    }
    if (visited.has(candidate)) return;
    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) {
      throw new TypeError("CST reader 不得返回 Tree Node 或其他带原型实例");
    }
    if (!Object.isFrozen(candidate)) {
      throw new TypeError("CST reader 返回的对象图必须完全冻结");
    }

    active.add(candidate);
    for (const key of Reflect.ownKeys(candidate)) {
      if (typeof key !== "string") {
        throw new TypeError("CST reader 返回值不得包含 symbol 属性");
      }
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new TypeError("CST reader 返回值不得包含访问器属性");
      }
      visit(descriptor.value);
    }
    active.delete(candidate);
    visited.add(candidate);
  };

  visit(value);
}

async function initializeRuntime(runtimeWasmUrl: string): Promise<void> {
  if (initializedRuntimeUrl !== undefined && initializedRuntimeUrl !== runtimeWasmUrl) {
    throw new Error("同一进程不能用不同 URL 重复初始化 web-tree-sitter runtime");
  }
  initializedRuntimeUrl ??= runtimeWasmUrl;
  runtimeInitialization ??= Parser.init({
    locateFile: (requestedFile: string, scriptDirectory: string) =>
      requestedFile === "web-tree-sitter.wasm"
        ? runtimeWasmUrl
        : new URL(requestedFile, scriptDirectory).href,
  });
  await runtimeInitialization;
}

function loadLanguage(input: string | Uint8Array): Promise<Language> {
  if (input instanceof Uint8Array) {
    return Language.load(Uint8Array.from(input));
  }
  let cached = languageCache.get(input);
  if (cached === undefined) {
    cached = Language.load(input);
    languageCache.set(input, cached);
  }
  return cached;
}
