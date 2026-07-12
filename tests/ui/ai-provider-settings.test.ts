import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
  });
});
