import { describe, expect, it } from "vitest";
import {
  assertMacReleaseCredentials,
  resolveNotarizationCredential,
  resolveSigningCredential,
} from "../../scripts/lib/macos-release-credentials.mjs";

const developerId =
  '  1) ABCDEF0123456789ABCDEF0123456789ABCDEF01 "Developer ID Application: HAN Chen (TEAMID1234)"';

describe("macOS release credentials", () => {
  it("accepts a Developer ID keychain identity and one complete notarization profile", () => {
    expect(
      assertMacReleaseCredentials({
        platform: "darwin",
        env: { APPLE_KEYCHAIN_PROFILE: "algolatch-notary" },
        identitiesOutput: developerId,
      }),
    ).toEqual({ signing: "keychain-identity", notarization: "keychain-profile" });
  });

  it("accepts CI certificate and API-key groups without exposing their values", () => {
    const env = {
      CSC_LINK: "base64-certificate",
      CSC_KEY_PASSWORD: "private-password",
      APPLE_API_KEY: "/tmp/AuthKey.p8",
      APPLE_API_KEY_ID: "KEYID",
      APPLE_API_ISSUER: "ISSUER",
    };
    expect(resolveSigningCredential(env, "0 valid identities found")).toBe("certificate-file");
    expect(resolveNotarizationCredential(env)).toBe("api-key");
  });

  it("fails closed for missing or partial signing credentials", () => {
    expect(() => resolveSigningCredential({}, "0 valid identities found")).toThrow(
      /Developer ID Application/u,
    );
    expect(() => resolveSigningCredential({ CSC_LINK: "certificate" }, "")).toThrow(
      /CSC_KEY_PASSWORD/u,
    );
  });

  it("fails closed for partial, absent, or ambiguous notarization credentials", () => {
    expect(() => resolveNotarizationCredential({ APPLE_API_KEY_ID: "KEYID" })).toThrow(
      /APPLE_API_KEY/u,
    );
    expect(() => resolveNotarizationCredential({})).toThrow(/没有 Apple 公证凭据/u);
    expect(() =>
      resolveNotarizationCredential({
        APPLE_KEYCHAIN_PROFILE: "profile",
        APPLE_ID: "developer@example.com",
        APPLE_APP_SPECIFIC_PASSWORD: "password",
        APPLE_TEAM_ID: "TEAM",
      }),
    ).toThrow(/多组/u);
  });

  it("rejects execution outside macOS", () => {
    expect(() =>
      assertMacReleaseCredentials({
        platform: "linux",
        env: { APPLE_KEYCHAIN_PROFILE: "profile" },
        identitiesOutput: developerId,
      }),
    ).toThrow(/只能在 macOS/u);
  });
});
