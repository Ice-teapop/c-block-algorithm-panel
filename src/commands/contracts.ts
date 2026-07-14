import type { RegisteredCommand } from "../workbench/contracts.js";

export interface WorkbenchCommandHandler {
  readonly id: string;
  readonly group: string;
  readonly detail: string;
  readonly keywords?: readonly string[] | undefined;
  readonly shortcut?: string | null | undefined;
  readonly labelEn?: string | undefined;
  readonly isAvailable?: (() => boolean) | undefined;
  readonly execute: () => void | Promise<void>;
}

export interface WorkbenchCommandDescriptor {
  readonly id: string;
  readonly label: string;
  readonly labelEn: string | null;
  readonly group: string;
  readonly detail: string;
  readonly keywords: readonly string[];
  readonly shortcut: string | null;
  readonly order: number;
  readonly moduleId: string;
}

export interface WorkbenchCommandRegistryInput {
  readonly contributions: readonly RegisteredCommand[];
  readonly handlers?: readonly WorkbenchCommandHandler[] | undefined;
}

export type WorkbenchCommandRegistration = Readonly<{
  contribution: RegisteredCommand;
  handler: WorkbenchCommandHandler;
}>;
