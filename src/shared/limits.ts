export interface RunnerLimits {
  readonly maxSourceBytes: number;
  readonly maxSourceNameBytes: number;
  readonly maxArtifactIdBytes: number;
  readonly maxArgumentCount: number;
  readonly maxArgumentBytes: number;
  readonly maxTotalArgumentBytes: number;
  readonly maxStdinBytes: number;
  readonly maxFixtureCount: number;
  readonly maxFixturePathBytes: number;
  readonly maxFixtureBytes: number;
  readonly maxTotalFixtureBytes: number;
  readonly compileWallTimeMs: number;
  readonly runWallTimeMs: number;
  readonly maxOutputBytes: number;
  readonly maxRssBytes: number;
  readonly maxProcessCount: number;
  readonly rssPollIntervalMs: number;
  readonly cpuTimeSeconds: number;
  readonly maxFileSizeBlocks: number;
  readonly maxOpenFiles: number;
  readonly artifactTtlMs: number;
  readonly maxArtifacts: number;
}

export const MAX_SOURCE_BYTES = 512 * 1024;

export const RUNNER_LIMITS: Readonly<RunnerLimits> = Object.freeze({
  maxSourceBytes: MAX_SOURCE_BYTES,
  maxSourceNameBytes: 128,
  maxArtifactIdBytes: 128,
  maxArgumentCount: 64,
  maxArgumentBytes: 16 * 1024,
  maxTotalArgumentBytes: 64 * 1024,
  maxStdinBytes: 1024 * 1024,
  maxFixtureCount: 64,
  maxFixturePathBytes: 512,
  maxFixtureBytes: 1024 * 1024,
  maxTotalFixtureBytes: 8 * 1024 * 1024,
  compileWallTimeMs: 10_000,
  runWallTimeMs: 3_000,
  maxOutputBytes: 1024 * 1024,
  maxRssBytes: 1024 * 1024 * 1024,
  maxProcessCount: 64,
  rssPollIntervalMs: 100,
  cpuTimeSeconds: 2,
  maxFileSizeBlocks: 10_240,
  maxOpenFiles: 64,
  artifactTtlMs: 5 * 60_000,
  maxArtifacts: 64,
});
