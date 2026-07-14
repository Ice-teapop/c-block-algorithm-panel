import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { promisify } from "node:util";
import { assertMacReleaseCredentials } from "./lib/macos-release-credentials.mjs";

const runFile = promisify(execFile);

try {
  const { stdout } = await runFile(
    "/usr/bin/security",
    ["find-identity", "-v", "-p", "codesigning"],
    { encoding: "utf8", timeout: 15_000, maxBuffer: 1024 * 1024 },
  );
  const credentials = assertMacReleaseCredentials({
    platform: process.platform,
    env: process.env,
    identitiesOutput: stdout,
  });
  if (credentials.notarization === "api-key") {
    const apiKey = await lstat(process.env.APPLE_API_KEY);
    if (!apiKey.isFile() || apiKey.size === 0) {
      throw new Error("公证 API Key 必须是非空普通文件");
    }
  }
  console.log(
    `✓ macOS 正式发布凭据就绪：签名=${credentials.signing}，公证=${credentials.notarization}`,
  );
} catch (error) {
  console.error(`✗ macOS 正式发布凭据未就绪：${formatError(error)}`);
  console.error("  未生成正式 DMG；开发测试请显式使用 npm run dist:mac:beta。");
  process.exitCode = 1;
}

function formatError(error) {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") {
    return "公证 API Key 文件不存在或不可读";
  }
  return error instanceof Error ? error.message : String(error);
}
