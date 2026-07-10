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
