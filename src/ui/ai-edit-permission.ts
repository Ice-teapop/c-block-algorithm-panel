import {
  AI_EDIT_PERMISSIONS,
  isAiEditPermission,
  type AiEditPermission,
} from "../shared/ai-edit.js";

export const AI_EDIT_PERMISSION_STORAGE_KEY = "c-block-algorithm-panel.ai-edit-permission.v1";
export const AI_EDIT_PERMISSION_CHANGE_EVENT = "ai-edit-permission-change";

export interface AiEditPermissionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readAiEditPermission(
  storage: AiEditPermissionStorage | undefined = safeStorage(),
): AiEditPermission {
  try {
    const value = storage?.getItem(AI_EDIT_PERMISSION_STORAGE_KEY);
    return isAiEditPermission(value) ? value : "read-only";
  } catch {
    return "read-only";
  }
}

export function writeAiEditPermission(
  permission: AiEditPermission,
  ownerDocument: Document = document,
  storage: AiEditPermissionStorage | undefined = safeStorage(),
): void {
  if (!isAiEditPermission(permission)) throw new TypeError("AI 修改权限无效");
  try {
    storage?.setItem(AI_EDIT_PERMISSION_STORAGE_KEY, permission);
  } catch {
    // The current window still receives the change when local persistence is unavailable.
  }
  ownerDocument.dispatchEvent(
    new CustomEvent<AiEditPermission>(AI_EDIT_PERMISSION_CHANGE_EVENT, {
      detail: permission,
    }),
  );
}

export function availableAiEditPermissions(maximum: AiEditPermission): readonly AiEditPermission[] {
  const limit = AI_EDIT_PERMISSIONS.indexOf(maximum);
  return Object.freeze(AI_EDIT_PERMISSIONS.slice(0, Math.max(0, limit) + 1));
}

function safeStorage(): AiEditPermissionStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
