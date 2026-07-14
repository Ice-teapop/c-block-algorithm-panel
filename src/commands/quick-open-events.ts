export type QuickOpenItemKind = "command" | "node" | "preset" | "library";

export interface QuickOpenItem {
  readonly id: string;
  readonly kind: QuickOpenItemKind;
  readonly targetId: string;
  readonly label: string;
  readonly detail: string;
  readonly keywords: readonly string[];
  readonly order: number;
  readonly shortcut?: string | null | undefined;
  /** Optional provider revision used to reject stale results at activation time. */
  readonly contextKey?: string | undefined;
}

export interface WorkbenchQuickOpenCollectDetail {
  readonly query: string;
  readonly scope: QuickOpenItemKind | null;
  add(items: readonly QuickOpenItem[]): void;
}

export interface WorkbenchQuickOpenActivateDetail {
  readonly item: QuickOpenItem;
}

export const WORKBENCH_QUICK_OPEN_COLLECT_EVENT = "workbench-quick-open-collect";
export const WORKBENCH_QUICK_OPEN_ACTIVATE_EVENT = "workbench-quick-open-activate";

export function quickOpenItemId(kind: QuickOpenItemKind, targetId: string): string {
  if (!["command", "node", "preset", "library"].includes(kind)) {
    throw new TypeError(`Quick Open kind 无效：${String(kind)}`);
  }
  if (typeof targetId !== "string" || targetId.length === 0) {
    throw new TypeError("Quick Open targetId 必须是非空字符串");
  }
  return `quick-open-${kind}-${encodeURIComponent(targetId)}`;
}

export function quickOpenCollectDetail(event: Event): WorkbenchQuickOpenCollectDetail | null {
  const detail = (event as CustomEvent<unknown>).detail;
  if (typeof detail !== "object" || detail === null || !("add" in detail)) return null;
  const candidate = detail as Partial<WorkbenchQuickOpenCollectDetail>;
  return typeof candidate.query === "string" &&
    (candidate.scope === null ||
      candidate.scope === "command" ||
      candidate.scope === "node" ||
      candidate.scope === "preset" ||
      candidate.scope === "library") &&
    typeof candidate.add === "function"
    ? (candidate as WorkbenchQuickOpenCollectDetail)
    : null;
}

export function quickOpenActivateDetail(event: Event): WorkbenchQuickOpenActivateDetail | null {
  const detail = (event as CustomEvent<unknown>).detail;
  if (typeof detail !== "object" || detail === null || !("item" in detail)) return null;
  const item = (detail as Partial<WorkbenchQuickOpenActivateDetail>).item;
  if (
    typeof item !== "object" ||
    item === null ||
    typeof item.id !== "string" ||
    typeof item.targetId !== "string" ||
    !["command", "node", "preset", "library"].includes(item.kind)
  ) {
    return null;
  }
  return detail as WorkbenchQuickOpenActivateDetail;
}
