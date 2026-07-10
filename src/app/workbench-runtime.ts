import { createThemeController } from "../ui/theme-controller.js";
import { mountWorkbench, type WorkbenchElements } from "../ui/workbench-shell.js";
import { createBuiltinWorkbenchRegistry } from "../workbench/builtin-modules.js";
import type { WorkbenchRegistrySnapshot } from "../workbench/contracts.js";

export interface WorkbenchRuntime {
  readonly elements: WorkbenchElements;
  readonly registrySnapshot: WorkbenchRegistrySnapshot;
  destroy(): void;
}

export function createWorkbenchRuntime(app: HTMLElement): WorkbenchRuntime {
  const registry = createBuiltinWorkbenchRegistry();
  const registrySnapshot = registry.snapshot();
  const elements = mountWorkbench(app, registrySnapshot);
  const themeController = createThemeController({
    root: document.documentElement,
    button: elements.themeButton,
  });
  let destroyed = false;

  return Object.freeze({
    elements,
    registrySnapshot,
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      themeController.destroy();
      elements.destroy();
    },
  });
}
