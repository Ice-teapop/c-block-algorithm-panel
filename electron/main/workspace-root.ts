import { isAbsolute, relative, resolve, sep } from "node:path";

export interface WorkspaceRootOptions {
  readonly isPackaged: boolean;
  readonly defaultRoot: string;
  readonly requestedRoot: string | undefined;
  readonly installedGate: string | undefined;
  readonly temporaryDirectory: string;
}

/**
 * Keeps production data in Documents while allowing the installed-DMG smoke
 * gate to use only its own two-level temporary workspace.
 */
export function resolveWorkspaceRoot(options: WorkspaceRootOptions): string {
  if (!options.isPackaged && options.requestedRoot !== undefined) {
    return options.requestedRoot;
  }
  if (!options.isPackaged || options.installedGate !== "1") {
    return options.defaultRoot;
  }
  const requested = options.requestedRoot;
  if (requested === undefined || !isInstalledGateWorkspace(requested, options.temporaryDirectory)) {
    throw new Error("安装态门禁工作区必须位于系统临时目录的专属 workspace 中");
  }
  return resolve(requested);
}

function isInstalledGateWorkspace(candidate: string, temporaryDirectory: string): boolean {
  if (!isAbsolute(candidate) || !isAbsolute(temporaryDirectory)) return false;
  const relativePath = relative(resolve(temporaryDirectory), resolve(candidate));
  const segments = relativePath.split(sep);
  return (
    segments.length === 2 &&
    segments[0]?.startsWith("c-block-installed-dmg-") === true &&
    segments[1] === "workspace"
  );
}
