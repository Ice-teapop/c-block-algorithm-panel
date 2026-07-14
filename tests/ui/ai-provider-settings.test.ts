import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aiProviderSettingsErrorMessage,
  providerDisplayLabel,
} from "../../src/ui/ai-provider-settings.js";

const source = readFileSync(
  new URL("../../src/ui/ai-provider-settings.ts", import.meta.url),
  "utf8",
);

describe("AI Provider settings surface", () => {
  it("keeps the flow to one key, one provider choice, model search and clear", () => {
    expect(source).toContain("parseAiCredentialInput");
    expect(source).toContain("connectAiProvider");
    expect(source).toContain("listAiProviderModels");
    expect(source).toContain("selectAiProviderModel");
    expect(source).toContain("disconnectAiProvider");
    expect(source).toContain('keyInput.type = "password"');
    expect(source).toContain('modelInput.setAttribute("list"');
  });

  it("does not expose an arbitrary endpoint or old generic save API", () => {
    expect(source).not.toContain("saveAiProviderConfig");
    expect(source).not.toContain("clearAiProviderCredential");
    expect(source).not.toContain('input.type = "url"');
    expect(source).not.toContain("API Endpoint");
    expect(source).not.toContain("status.textContent = result.error.message");
    expect(source).not.toContain("status.textContent = parsed.message");
  });

  it("explains the unlocked workflow before asking for a credential", () => {
    expect(source).toContain("识别并解释算法、查找可疑逻辑和边界缺口");
    expect(source).not.toContain("检查正确性");
    expect(source).toContain("单击顶部“AI”打开对话窗口");
    expect(source).toContain("受控执行也只能提交当前 main.c 的候选差异");
    expect(source).toContain("dispatchAiProviderConfigChange");
    expect(source).toContain('status.dataset.state = "idle"');
  });

  it("does not expose raw localized IPC errors in English mode", () => {
    const error = {
      code: "AI_PROVIDER_CREDENTIAL_REJECTED" as const,
      message: "官方服务拒绝了这个密钥",
    };
    expect(aiProviderSettingsErrorMessage(error, "en")).toBe("The provider rejected the API key.");
    expect(aiProviderSettingsErrorMessage(error, "en")).not.toMatch(/[\p{Script=Han}]/u);
    expect(aiProviderSettingsErrorMessage(error, "zh-CN")).toBe(error.message);
    expect(
      ["openai", "anthropic", "gemini", "openrouter", "deepseek", "glm", "kimi-cn", "kimi-global"]
        .map((id) => providerDisplayLabel(id as Parameters<typeof providerDisplayLabel>[0], "en"))
        .join(" "),
    ).not.toMatch(/[\p{Script=Han}]/u);
  });
});
