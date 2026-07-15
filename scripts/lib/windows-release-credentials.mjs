import { lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";

const SIGNING_VARIABLES = Object.freeze(["WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD"]);
const BASE64_PREFIX = /^data:[^,]*;base64,/iu;

export function assertWindowsReleaseCredentials({ platform, env, cwd }) {
  if (platform !== "win32") {
    throw new Error(`正式 Windows 发布只能在 Windows 执行，当前平台：${String(platform)}`);
  }
  const missing = SIGNING_VARIABLES.filter((name) => !hasValue(env?.[name]));
  if (missing.length > 0) {
    throw new Error(`Windows 签名凭据不完整：${missing.join(", ")}`);
  }
  const certificate = resolveWindowsCertificateReference(env.WIN_CSC_LINK, cwd);
  return Object.freeze({ signing: "certificate-file", certificate });
}

export function resolveWindowsCertificateReference(value, cwd = process.cwd()) {
  const reference = typeof value === "string" ? value.trim() : "";
  if (reference.length === 0) {
    throw new Error("Windows 签名凭据不完整：WIN_CSC_LINK");
  }
  if (reference.startsWith("https://")) {
    return Object.freeze({ kind: "https-url" });
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(reference)) {
    throw new Error("WIN_CSC_LINK 远程证书只允许 HTTPS");
  }
  if (looksLikeBase64(reference)) {
    validateBase64Reference(reference);
    return Object.freeze({ kind: "base64" });
  }
  const path = resolveCertificatePath(reference, cwd);
  if (!/\.(?:p12|pfx)$/iu.test(path)) {
    throw new Error("本地 Windows 签名证书必须是 .p12 或 .pfx 文件");
  }
  return Object.freeze({ kind: "local-file", path });
}

export async function validateWindowsCertificateReference(certificate) {
  if (certificate?.kind !== "local-file") return;
  let stat;
  try {
    stat = await lstat(certificate.path);
  } catch {
    throw new Error("本地 Windows 签名证书不存在或不可读");
  }
  if (!stat.isFile() || stat.size === 0) {
    throw new Error("本地 Windows 签名证书必须是非空普通文件");
  }
}

function resolveCertificatePath(reference, cwd) {
  if (reference.startsWith("file://")) {
    try {
      return fileURLToPath(reference);
    } catch {
      throw new Error("WIN_CSC_LINK 本地文件 URL 无效");
    }
  }
  if (reference.startsWith("~/") || reference.startsWith("~\\")) {
    return resolve(homedir(), reference.slice(2));
  }
  if (isAbsolute(reference) || win32.isAbsolute(reference)) return reference;
  return resolve(cwd, reference);
}

function looksLikeBase64(reference) {
  return BASE64_PREFIX.test(reference) || reference.length > 2048 || reference.endsWith("=");
}

function validateBase64Reference(reference) {
  const payload = reference.replace(BASE64_PREFIX, "");
  if (payload.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(payload)) {
    throw new Error("WIN_CSC_LINK Base64 证书无效");
  }
  const decoded = Buffer.from(payload, "base64");
  if (decoded.length === 0) throw new Error("WIN_CSC_LINK Base64 证书无效");
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}
