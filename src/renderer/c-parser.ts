import { CParser } from "../core/index.js";
import languageWasmUrl from "../../resources/wasm/tree-sitter-c.wasm?url";
import runtimeWasmUrl from "../../resources/wasm/web-tree-sitter.wasm?url";

export async function createBrowserCParser(): Promise<CParser> {
  const languageWasm = await readWasmBytes(languageWasmUrl);
  return CParser.create({ runtimeWasmUrl, languageWasm });
}

async function readWasmBytes(url: string): Promise<Uint8Array> {
  if (url.startsWith("file:")) {
    return readFileUrlWithXhr(url);
  }
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`C grammar WASM 加载失败：HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function readFileUrlWithXhr(url: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "arraybuffer";
    request.addEventListener("load", () => {
      if (
        (request.status === 0 || request.status === 200) &&
        request.response instanceof ArrayBuffer
      ) {
        resolve(new Uint8Array(request.response));
        return;
      }
      reject(new Error(`C grammar WASM file 加载失败：status ${request.status}`));
    });
    request.addEventListener("error", () => reject(new Error("C grammar WASM file 请求失败")));
    request.send();
  });
}
