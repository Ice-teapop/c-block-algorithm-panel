import { resolve } from "node:path";
import { CParser } from "../../src/core/index.js";

const projectRoot = resolve(import.meta.dirname, "../..");

export const TEST_PARSER_ASSETS = Object.freeze({
  runtimeWasmUrl: resolve(projectRoot, "resources/wasm/web-tree-sitter.wasm"),
  languageWasm: resolve(projectRoot, "resources/wasm/tree-sitter-c.wasm"),
});

export function createTestParser(): Promise<CParser> {
  return CParser.create(TEST_PARSER_ASSETS);
}
