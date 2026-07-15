import {
  assertWindowsReleaseCredentials,
  validateWindowsCertificateReference,
} from "./lib/windows-release-credentials.mjs";

try {
  const credentials = assertWindowsReleaseCredentials({
    platform: process.platform,
    env: process.env,
    cwd: process.cwd(),
  });
  await validateWindowsCertificateReference(credentials.certificate);
  console.log(
    `✓ Windows 正式发布凭据就绪：签名=${credentials.signing}，来源=${credentials.certificate.kind}`,
  );
} catch (error) {
  console.error(`✗ Windows 正式发布凭据未就绪：${formatError(error)}`);
  console.error("  未生成正式安装包；开发测试请显式使用 npm run dist:win:beta。");
  process.exitCode = 1;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
