import type {
  Capabilities,
  CompileRequest,
  CompileResult,
  DiagnoseRequest,
  DiagnoseResult,
  RunRequest,
  RunResult,
} from "../../../src/shared/api.js";
import { parseRunnerMode } from "./capability.js";
import {
  Runner,
  type RunnerOptions,
  type TrustedExecutionGrant,
  type TrustedOperation,
  type TrustedRequestSummary,
} from "./runner.js";

let defaultRunner: Runner | undefined;

function getDefaultRunner(): Runner {
  defaultRunner ??= new Runner({
    mode: parseRunnerMode(process.env.PANEL_RUNNER_MODE),
  });
  return defaultRunner;
}

export async function getCapabilities(): Promise<Capabilities> {
  return getDefaultRunner().getCapabilities();
}

export function describeTrustedRequest(
  operation: "compile",
  request: CompileRequest,
): TrustedRequestSummary;
export function describeTrustedRequest(
  operation: "run",
  request: RunRequest,
): TrustedRequestSummary;
export function describeTrustedRequest(
  operation: "diagnose",
  request: DiagnoseRequest,
): TrustedRequestSummary;
export function describeTrustedRequest(
  operation: TrustedOperation,
  request: CompileRequest | RunRequest | DiagnoseRequest,
): TrustedRequestSummary {
  const runner = getDefaultRunner();
  if (operation === "compile") {
    return runner.describeTrustedRequest(operation, request as CompileRequest);
  }
  if (operation === "run") return runner.describeTrustedRequest(operation, request as RunRequest);
  return runner.describeTrustedRequest(operation, request as DiagnoseRequest);
}

export function createTrustedExecutionGrant(
  operation: "compile",
  request: CompileRequest,
): TrustedExecutionGrant;
export function createTrustedExecutionGrant(
  operation: "run",
  request: RunRequest,
): TrustedExecutionGrant;
export function createTrustedExecutionGrant(
  operation: "diagnose",
  request: DiagnoseRequest,
): TrustedExecutionGrant;
export function createTrustedExecutionGrant(
  operation: TrustedOperation,
  request: CompileRequest | RunRequest | DiagnoseRequest,
): TrustedExecutionGrant {
  const runner = getDefaultRunner();
  if (operation === "compile") {
    return runner.createTrustedExecutionGrant(operation, request as CompileRequest);
  }
  if (operation === "run") {
    return runner.createTrustedExecutionGrant(operation, request as RunRequest);
  }
  return runner.createTrustedExecutionGrant(operation, request as DiagnoseRequest);
}

export async function compile(
  request: CompileRequest,
  trustedGrant?: TrustedExecutionGrant,
): Promise<CompileResult> {
  return getDefaultRunner().compile(request, trustedGrant);
}

export async function run(
  request: RunRequest,
  trustedGrant?: TrustedExecutionGrant,
): Promise<RunResult> {
  return getDefaultRunner().run(request, trustedGrant);
}

export async function diagnose(
  request: DiagnoseRequest,
  trustedGrant?: TrustedExecutionGrant,
): Promise<DiagnoseResult> {
  return getDefaultRunner().diagnose(request, trustedGrant);
}

export async function disposeRunner(): Promise<void> {
  if (defaultRunner === undefined) {
    return;
  }
  const runner = defaultRunner;
  await runner.dispose();
}

export function createRunner(options: RunnerOptions = {}): Runner {
  return new Runner(options);
}

export type { RunnerOptions, TrustedExecutionGrant, TrustedOperation, TrustedRequestSummary };
