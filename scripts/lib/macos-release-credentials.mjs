const SIGNING_VARIABLES = Object.freeze(["CSC_LINK", "CSC_KEY_PASSWORD"]);
const NOTARY_GROUPS = Object.freeze([
  Object.freeze({
    id: "api-key",
    variables: Object.freeze(["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"]),
  }),
  Object.freeze({
    id: "apple-id",
    variables: Object.freeze(["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"]),
  }),
  Object.freeze({
    id: "keychain-profile",
    variables: Object.freeze(["APPLE_KEYCHAIN_PROFILE"]),
  }),
]);

export function assertMacReleaseCredentials({ platform, env, identitiesOutput }) {
  if (platform !== "darwin") {
    throw new Error(`正式 macOS 发布只能在 macOS 执行，当前平台：${String(platform)}`);
  }
  const signing = resolveSigningCredential(env, identitiesOutput);
  const notarization = resolveNotarizationCredential(env);
  return Object.freeze({ signing, notarization });
}

export function resolveSigningCredential(env, identitiesOutput) {
  const supplied = SIGNING_VARIABLES.filter((name) => hasValue(env?.[name]));
  if (supplied.length > 0 && supplied.length !== SIGNING_VARIABLES.length) {
    throw new Error(`签名凭据不完整：${missingVariables(SIGNING_VARIABLES, env).join(", ")}`);
  }
  if (supplied.length === SIGNING_VARIABLES.length) return "certificate-file";
  if (/"Developer ID Application:[^"\r\n]+"/u.test(String(identitiesOutput))) {
    return "keychain-identity";
  }
  throw new Error(
    "没有可用的 Developer ID Application 证书；请安装到钥匙串，或设置 CSC_LINK 与 CSC_KEY_PASSWORD。",
  );
}

export function resolveNotarizationCredential(env) {
  const activeGroups = NOTARY_GROUPS.filter((group) =>
    group.variables.some((name) => hasValue(env?.[name])),
  );
  for (const group of activeGroups) {
    const missing = missingVariables(group.variables, env);
    if (missing.length > 0) {
      throw new Error(`Apple 公证凭据不完整：${missing.join(", ")}`);
    }
  }
  if (activeGroups.length === 0) {
    throw new Error(
      "没有 Apple 公证凭据；请配置 API Key、Apple ID 应用专用密码，或 notarytool 钥匙串 profile。",
    );
  }
  if (activeGroups.length > 1) {
    throw new Error("检测到多组 Apple 公证凭据；请只保留一种，避免使用错误的开发者团队。");
  }
  return activeGroups[0].id;
}

function missingVariables(names, env) {
  return names.filter((name) => !hasValue(env?.[name]));
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}
