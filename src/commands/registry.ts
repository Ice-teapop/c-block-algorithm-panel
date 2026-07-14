import type {
  WorkbenchCommandDescriptor,
  WorkbenchCommandHandler,
  WorkbenchCommandRegistration,
  WorkbenchCommandRegistryInput,
} from "./contracts.js";
import type { RegisteredCommand } from "../workbench/contracts.js";

const COMMAND_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;

export class WorkbenchCommandRegistry {
  readonly #contributions = new Map<string, RegisteredCommand>();
  readonly #handlers = new Map<string, WorkbenchCommandHandler>();
  #destroyed = false;

  constructor(input: WorkbenchCommandRegistryInput) {
    if (input === null || typeof input !== "object" || !Array.isArray(input.contributions)) {
      throw new TypeError("命令注册表必须提供 contributions");
    }
    for (const contribution of input.contributions) {
      if (this.#contributions.has(contribution.id)) {
        throw new TypeError(`命令贡献重复：${contribution.id}`);
      }
      this.#contributions.set(contribution.id, contribution);
    }
    this.registerAll(input.handlers ?? []);
  }

  register(handler: WorkbenchCommandHandler): this {
    return this.registerAll([handler]);
  }

  registerAll(handlers: readonly WorkbenchCommandHandler[]): this {
    this.#assertActive();
    if (!Array.isArray(handlers)) throw new TypeError("命令 handlers 必须是数组");
    const normalized = handlers.map(normalizeHandler);
    const claimed = new Set(this.#handlers.keys());
    for (const handler of normalized) {
      if (!this.#contributions.has(handler.id)) {
        throw new RangeError(`命令尚未声明：${handler.id}`);
      }
      if (claimed.has(handler.id)) throw new TypeError(`命令执行器重复：${handler.id}`);
      claimed.add(handler.id);
    }
    for (const handler of normalized) this.#handlers.set(handler.id, handler);
    return this;
  }

  listAvailable(): readonly WorkbenchCommandDescriptor[] {
    this.#assertActive();
    const commands = [...this.#handlers.entries()].flatMap(([id, handler]) => {
      const contribution = this.#contributions.get(id);
      if (contribution === undefined || !isAvailable(handler)) return [];
      return [descriptor(contribution, handler)];
    });
    return Object.freeze(
      commands.sort(
        (left, right) =>
          left.order - right.order ||
          left.label.localeCompare(right.label, "zh-Hans-CN") ||
          left.id.localeCompare(right.id, "en"),
      ),
    );
  }

  async execute(id: string): Promise<void> {
    this.#assertActive();
    assertCommandId(id);
    const handler = this.#handlers.get(id);
    if (handler === undefined) throw new RangeError(`命令没有执行器：${id}`);
    if (!isAvailable(handler)) throw new Error(`命令当前不可用：${id}`);
    await handler.execute();
  }

  snapshot(): readonly WorkbenchCommandRegistration[] {
    this.#assertActive();
    return Object.freeze(
      [...this.#handlers.entries()]
        .map(([id, handler]) =>
          Object.freeze({ contribution: this.#contributions.get(id)!, handler }),
        )
        .sort(
          (left, right) =>
            left.contribution.order - right.contribution.order ||
            left.contribution.id.localeCompare(right.contribution.id, "en"),
        ),
    );
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#handlers.clear();
    this.#contributions.clear();
  }

  #assertActive(): void {
    if (this.#destroyed) throw new Error("命令注册表已销毁");
  }
}

function normalizeHandler(handler: WorkbenchCommandHandler): WorkbenchCommandHandler {
  if (handler === null || typeof handler !== "object") {
    throw new TypeError("命令执行器必须是对象");
  }
  const id = assertCommandId(handler.id);
  if (typeof handler.execute !== "function") throw new TypeError(`命令 ${id} 缺少 execute`);
  if (handler.isAvailable !== undefined && typeof handler.isAvailable !== "function") {
    throw new TypeError(`命令 ${id} 的 isAvailable 必须是函数`);
  }
  const keywords = handler.keywords ?? [];
  if (!Array.isArray(keywords) || keywords.some((keyword) => typeof keyword !== "string")) {
    throw new TypeError(`命令 ${id} 的 keywords 必须是字符串数组`);
  }
  return Object.freeze({
    id,
    group: nonEmpty(handler.group, `命令 ${id} 的 group`),
    detail: nonEmpty(handler.detail, `命令 ${id} 的 detail`),
    keywords: Object.freeze(keywords.map((keyword) => keyword.trim()).filter(Boolean)),
    shortcut: handler.shortcut === undefined ? null : nullableText(handler.shortcut, "shortcut"),
    labelEn: handler.labelEn === undefined ? undefined : nonEmpty(handler.labelEn, "labelEn"),
    ...(handler.isAvailable === undefined ? {} : { isAvailable: handler.isAvailable }),
    execute: handler.execute,
  });
}

function descriptor(
  contribution: RegisteredCommand,
  handler: WorkbenchCommandHandler,
): WorkbenchCommandDescriptor {
  return Object.freeze({
    id: contribution.id,
    label: contribution.label,
    labelEn: handler.labelEn ?? null,
    group: handler.group,
    detail: handler.detail,
    keywords: Object.freeze([...(handler.keywords ?? [])]),
    shortcut: handler.shortcut ?? null,
    order: contribution.order,
    moduleId: contribution.moduleId,
  });
}

function isAvailable(handler: WorkbenchCommandHandler): boolean {
  try {
    return handler.isAvailable?.() ?? true;
  } catch {
    return false;
  }
}

function assertCommandId(value: string): string {
  if (typeof value !== "string" || !COMMAND_ID_PATTERN.test(value)) {
    throw new TypeError(`命令 id 无效：${String(value)}`);
  }
  return value;
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} 必须是非空字符串`);
  }
  return value.trim();
}

function nullableText(value: string | null, label: string): string | null {
  if (value === null) return null;
  return nonEmpty(value, label);
}
