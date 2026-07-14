import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { ConfigEnv, UserConfig } from "vite";
import viteConfig, {
  CODE_MIRROR_STYLE_NONCE_PLACEHOLDER,
  CODE_MIRROR_STYLE_NONCE_PLUGIN_NAME,
  injectCodeMirrorStyleNonce,
} from "../../vite.config.js";

const NONCE_DEFINE = "__CODEMIRROR_STYLE_NONCE__";
const BASE64_128_BIT_PATTERN = /^[A-Za-z0-9+/]{22}==$/u;

describe("CodeMirror CSP nonce Vite configuration", () => {
  it("injects the same random nonce into renderer code and the HTML CSP", async () => {
    const [serveConfig, buildConfig, sourceHtml] = await Promise.all([
      resolveViteConfig({ command: "serve", mode: "development" }),
      resolveViteConfig({ command: "build", mode: "production" }),
      readFile(new URL("../../index.html", import.meta.url), "utf8"),
    ]);

    const serveNonce = configuredNonce(serveConfig);
    const buildNonce = configuredNonce(buildConfig);
    expect(serveNonce).toBe(buildNonce);
    expect(serveNonce).toMatch(BASE64_128_BIT_PATTERN);

    for (const config of [serveConfig, buildConfig]) {
      expect(config.plugins).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: CODE_MIRROR_STYLE_NONCE_PLUGIN_NAME }),
        ]),
      );
    }

    const transformedHtml = injectCodeMirrorStyleNonce(sourceHtml, serveNonce);
    expect(transformedHtml).toContain(`style-src 'self' 'nonce-${serveNonce}'`);
    expect(transformedHtml).not.toContain(CODE_MIRROR_STYLE_NONCE_PLACEHOLDER);
    expect(transformedHtml).not.toContain("unsafe-inline");
  });

  it("fails closed when the CSP nonce placeholder is missing or duplicated", () => {
    expect(() => injectCodeMirrorStyleNonce("<html></html>", "nonce")).toThrow(/缺少/u);
    expect(() =>
      injectCodeMirrorStyleNonce(
        `${CODE_MIRROR_STYLE_NONCE_PLACEHOLDER}${CODE_MIRROR_STYLE_NONCE_PLACEHOLDER}`,
        "nonce",
      ),
    ).toThrow(/只能包含一个/u);
  });

  it("emits each sandboxed preload as one self-contained CJS file", async () => {
    const [mainPreload, aiPreload] = await Promise.all([
      resolveViteConfig({ command: "build", mode: "electron-preload" }),
      resolveViteConfig({ command: "build", mode: "electron-ai-preload" }),
    ]);
    expect(preloadOutput(mainPreload)).toMatchObject({
      entryFileNames: "index.cjs",
      format: "cjs",
      codeSplitting: false,
    });
    expect(preloadOutput(aiPreload)).toMatchObject({
      entryFileNames: "ai-window.cjs",
      format: "cjs",
      codeSplitting: false,
    });
    expect(mainPreload.build?.emptyOutDir).toBe(true);
    expect(aiPreload.build?.emptyOutDir).toBe(false);
  });

  it("loads the native AI window CSS as a CSP-compatible external stylesheet", async () => {
    const [html, componentSource] = await Promise.all([
      readFile(new URL("../../ai-window.html", import.meta.url), "utf8"),
      readFile(new URL("../../src/ui/ai-workspace-window.ts", import.meta.url), "utf8"),
    ]);
    expect(html).toContain('<link rel="stylesheet" href="/src/ui/ai-workspace-window.css" />');
    expect(html).toContain("style-src 'self'");
    expect(html).not.toContain("unsafe-inline");
    expect(componentSource).not.toContain('import "./ai-workspace-window.css"');
  });
});

async function resolveViteConfig(environment: ConfigEnv): Promise<UserConfig> {
  if (typeof viteConfig !== "function") {
    throw new TypeError("Vite 配置必须保持为环境感知的配置工厂");
  }
  return viteConfig(environment);
}

function configuredNonce(config: UserConfig): string {
  const serializedNonce = config.define?.[NONCE_DEFINE];
  if (typeof serializedNonce !== "string") {
    throw new TypeError("Vite renderer 配置缺少 CodeMirror nonce define");
  }
  const nonce: unknown = JSON.parse(serializedNonce);
  if (typeof nonce !== "string") {
    throw new TypeError("CodeMirror nonce define 必须序列化为 string");
  }
  return nonce;
}

function preloadOutput(config: UserConfig): Record<string, unknown> {
  const output = config.build?.rollupOptions?.output;
  const resolved = Array.isArray(output) ? output[0] : output;
  if (resolved === undefined || typeof resolved === "function") {
    throw new TypeError("Preload output configuration is unavailable");
  }
  return resolved as Record<string, unknown>;
}
