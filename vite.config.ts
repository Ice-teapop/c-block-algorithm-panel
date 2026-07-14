import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const DEFAULT_DEV_SERVER_PORT = 5173;
const CODE_MIRROR_STYLE_NONCE_BYTES = 16;
export const CODE_MIRROR_STYLE_NONCE_PLACEHOLDER = "__CODEMIRROR_STYLE_NONCE__";
export const CODE_MIRROR_STYLE_NONCE_PLUGIN_NAME = "panel-code-mirror-style-nonce";

const codeMirrorStyleNonce = randomBytes(CODE_MIRROR_STYLE_NONCE_BYTES).toString("base64");
const parsedDevServerPort = Number.parseInt(
  process.env.PANEL_DEV_SERVER_PORT ?? String(DEFAULT_DEV_SERVER_PORT),
  10,
);

if (
  !Number.isSafeInteger(parsedDevServerPort) ||
  parsedDevServerPort < 1 ||
  parsedDevServerPort > 65_535
) {
  throw new Error("PANEL_DEV_SERVER_PORT 必须是 1 到 65535 的整数");
}

const preloadEntry = fileURLToPath(new URL("./electron/preload/index.ts", import.meta.url));
const aiWindowPreloadEntry = fileURLToPath(
  new URL("./electron/preload/ai-window.ts", import.meta.url),
);
const rendererEntry = fileURLToPath(new URL("./index.html", import.meta.url));
const aiWindowRendererEntry = fileURLToPath(new URL("./ai-window.html", import.meta.url));

export function injectCodeMirrorStyleNonce(html: string, nonce: string): string {
  const firstOccurrence = html.indexOf(CODE_MIRROR_STYLE_NONCE_PLACEHOLDER);
  if (firstOccurrence < 0) {
    throw new Error("index.html 缺少 CodeMirror CSP nonce 占位符");
  }
  if (
    html.indexOf(
      CODE_MIRROR_STYLE_NONCE_PLACEHOLDER,
      firstOccurrence + CODE_MIRROR_STYLE_NONCE_PLACEHOLDER.length,
    ) >= 0
  ) {
    throw new Error("index.html 必须且只能包含一个 CodeMirror CSP nonce 占位符");
  }
  return html.replace(CODE_MIRROR_STYLE_NONCE_PLACEHOLDER, nonce);
}

export default defineConfig(({ mode }) => {
  if (mode === "electron-preload" || mode === "electron-ai-preload") {
    const aiWindow = mode === "electron-ai-preload";
    return {
      build: {
        copyPublicDir: false,
        // The first build removes stale shared chunks; the second adds the isolated AI preload.
        emptyOutDir: !aiWindow,
        outDir: "dist-electron/preload",
        sourcemap: false,
        rollupOptions: {
          // Sandboxed Electron preloads cannot require local shared chunks. Build each entry in a
          // separate pass and inline all of its validators into one self-contained CJS file.
          input: aiWindow ? aiWindowPreloadEntry : preloadEntry,
          external: ["electron"],
          output: {
            entryFileNames: aiWindow ? "ai-window.cjs" : "index.cjs",
            format: "cjs",
            codeSplitting: false,
          },
        },
      },
    };
  }

  return {
    base: "./",
    define: {
      __CODEMIRROR_STYLE_NONCE__: JSON.stringify(codeMirrorStyleNonce),
    },
    plugins: [
      {
        name: CODE_MIRROR_STYLE_NONCE_PLUGIN_NAME,
        transformIndexHtml: (html, context) =>
          context.path.endsWith("/ai-window.html")
            ? html
            : injectCodeMirrorStyleNonce(html, codeMirrorStyleNonce),
      },
    ],
    server: {
      host: "127.0.0.1",
      port: parsedDevServerPort,
      strictPort: true,
    },
    build: {
      rollupOptions: {
        input: { index: rendererEntry, "ai-window": aiWindowRendererEntry },
      },
    },
  };
});
