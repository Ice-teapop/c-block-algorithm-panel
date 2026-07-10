import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const DEFAULT_DEV_SERVER_PORT = 5173;
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

export default defineConfig(({ mode }) => {
  if (mode === "electron-preload") {
    return {
      build: {
        copyPublicDir: false,
        emptyOutDir: false,
        outDir: "dist-electron/preload",
        sourcemap: true,
        rollupOptions: {
          input: preloadEntry,
          external: ["electron"],
          output: {
            entryFileNames: "index.cjs",
            format: "cjs",
          },
        },
      },
    };
  }

  return {
    base: "./",
    server: {
      host: "127.0.0.1",
      port: parsedDevServerPort,
      strictPort: true,
    },
  };
});
