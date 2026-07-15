import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertWindowsReleaseCredentials,
  resolveWindowsCertificateReference,
  validateWindowsCertificateReference,
} from "../../scripts/lib/windows-release-credentials.mjs";

describe("Windows release credentials", () => {
  it("accepts only a complete WIN_CSC certificate and password pair", () => {
    const result = assertWindowsReleaseCredentials({
      platform: "win32",
      env: {
        WIN_CSC_LINK: "data:application/x-pkcs12;base64,Y2VydGlmaWNhdGU=",
        WIN_CSC_KEY_PASSWORD: "private-password",
      },
      cwd: "C:\\project",
    });

    expect(result).toEqual({
      signing: "certificate-file",
      certificate: { kind: "base64" },
    });
  });

  it("fails closed for absent, partial, or generic CSC credentials", () => {
    expect(() =>
      assertWindowsReleaseCredentials({ platform: "win32", env: {}, cwd: "C:\\project" }),
    ).toThrow(/WIN_CSC_LINK/u);
    expect(() =>
      assertWindowsReleaseCredentials({
        platform: "win32",
        env: { WIN_CSC_LINK: "certificate.pfx" },
        cwd: "C:\\project",
      }),
    ).toThrow(/WIN_CSC_KEY_PASSWORD/u);
    expect(() =>
      assertWindowsReleaseCredentials({
        platform: "win32",
        env: { CSC_LINK: "certificate.pfx", CSC_KEY_PASSWORD: "password" },
        cwd: "C:\\project",
      }),
    ).toThrow(/WIN_CSC_LINK/u);
  });

  it("rejects release signing outside Windows", () => {
    expect(() =>
      assertWindowsReleaseCredentials({
        platform: "darwin",
        env: {
          WIN_CSC_LINK: "certificate.pfx",
          WIN_CSC_KEY_PASSWORD: "private-password",
        },
        cwd: "/project",
      }),
    ).toThrow(/只能在 Windows/u);
  });

  it("accepts HTTPS without revealing the URL and rejects other remote protocols", () => {
    expect(resolveWindowsCertificateReference("https://example.invalid/certificate.pfx")).toEqual({
      kind: "https-url",
    });
    expect(() =>
      resolveWindowsCertificateReference("http://example.invalid/private-certificate.pfx"),
    ).toThrow(/只允许 HTTPS/u);
  });

  it("requires local certificate paths to be non-empty regular .p12 or .pfx files", async () => {
    const root = await mkdtemp(join(tmpdir(), "algolatch-windows-credential-"));
    const validPath = join(root, "release.pfx");
    const emptyPath = join(root, "empty.p12");
    const directoryPath = join(root, "directory.pfx");
    await writeFile(validPath, "certificate");
    await writeFile(emptyPath, "");
    await mkdir(directoryPath);

    const valid = resolveWindowsCertificateReference(validPath, root);
    await expect(validateWindowsCertificateReference(valid)).resolves.toBeUndefined();
    await expect(
      validateWindowsCertificateReference(resolveWindowsCertificateReference(emptyPath, root)),
    ).rejects.toThrow(/非空普通文件/u);
    await expect(
      validateWindowsCertificateReference(resolveWindowsCertificateReference(directoryPath, root)),
    ).rejects.toThrow(/非空普通文件/u);
    await expect(
      validateWindowsCertificateReference(
        resolveWindowsCertificateReference(join(root, "missing.pfx"), root),
      ),
    ).rejects.toThrow(/不存在或不可读/u);
    expect(() => resolveWindowsCertificateReference(join(root, "certificate.pem"), root)).toThrow(
      /\.p12 或 \.pfx/u,
    );
  });

  it("never includes credential values in validation errors", () => {
    const secretLink = "http://secret.example.invalid/private.pfx";
    const secretPassword = "do-not-print-this-password";
    let message = "";
    try {
      assertWindowsReleaseCredentials({
        platform: "win32",
        env: { WIN_CSC_LINK: secretLink, WIN_CSC_KEY_PASSWORD: secretPassword },
        cwd: "C:\\project",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain(secretLink);
    expect(message).not.toContain(secretPassword);
  });
});
