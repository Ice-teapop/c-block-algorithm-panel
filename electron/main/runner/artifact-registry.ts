import { rm } from "node:fs/promises";
import type { RunnerLimits } from "../../../src/shared/limits.js";
import { RunnerFailure } from "./errors.js";
import type { RunnerClock, TimerToken } from "./process-host.js";

const ARTIFACT_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_ID_GENERATION_ATTEMPTS = 8;

export type ArtifactRuntimeProfile = "standard" | "sanitizer";

interface ArtifactEntry {
  readonly id: string;
  readonly directory: string;
  readonly executablePath: string;
  readonly runtimeProfile: ArtifactRuntimeProfile;
  readonly expiresAtMs: number;
  activeLeases: number;
  expired: boolean;
  expirationTimer: TimerToken | undefined;
  removalPromise: Promise<void> | undefined;
}

export interface ArtifactLease {
  readonly executablePath: string;
  readonly expiresAtMs: number;
  readonly runtimeProfile: ArtifactRuntimeProfile;
  release(): Promise<void>;
}

export interface ArtifactRegistryDependencies {
  readonly clock: RunnerClock;
  readonly idGenerator: () => string;
}

export class ArtifactRegistry {
  readonly #entries = new Map<string, ArtifactEntry>();
  readonly #expiredIds = new Set<string>();
  readonly #limits: RunnerLimits;
  readonly #dependencies: ArtifactRegistryDependencies;
  #lastCleanupError: Error | undefined;

  constructor(limits: RunnerLimits, dependencies: ArtifactRegistryDependencies) {
    this.#limits = limits;
    this.#dependencies = dependencies;
  }

  async register(
    directory: string,
    executablePath: string,
    runtimeProfile: ArtifactRuntimeProfile,
  ): Promise<{ readonly id: string; readonly expiresAtMs: number }> {
    await this.cleanupExpired();
    if (this.#entries.size >= this.#limits.maxArtifacts) {
      throw new RunnerFailure(
        "ARTIFACT_CAPACITY_REACHED",
        "已达到编译制品数量上限，请等待旧制品过期。",
      );
    }

    const id = this.#generateUniqueId();
    const expiresAtMs = this.#dependencies.clock.now() + this.#limits.artifactTtlMs;
    const entry: ArtifactEntry = {
      id,
      directory,
      executablePath,
      runtimeProfile,
      expiresAtMs,
      activeLeases: 0,
      expired: false,
      expirationTimer: undefined,
      removalPromise: undefined,
    };
    this.#entries.set(id, entry);
    entry.expirationTimer = this.#dependencies.clock.setTimeout(() => {
      entry.expirationTimer = undefined;
      void this.#expire(entry).catch((error: unknown) => {
        this.#lastCleanupError = asError(error);
      });
    }, this.#limits.artifactTtlMs);
    return Object.freeze({ id, expiresAtMs });
  }

  async acquire(id: string): Promise<ArtifactLease> {
    const entry = this.#entries.get(id);
    if (entry === undefined) {
      if (this.#expiredIds.has(id)) {
        throw new RunnerFailure("ARTIFACT_EXPIRED", "编译制品已经过期。");
      }
      throw new RunnerFailure("ARTIFACT_NOT_FOUND", "找不到编译制品。");
    }

    if (entry.expired || entry.expiresAtMs <= this.#dependencies.clock.now()) {
      await this.#expire(entry);
      throw new RunnerFailure("ARTIFACT_EXPIRED", "编译制品已经过期。");
    }

    entry.activeLeases += 1;
    let released = false;
    return Object.freeze({
      executablePath: entry.executablePath,
      expiresAtMs: entry.expiresAtMs,
      runtimeProfile: entry.runtimeProfile,
      release: async () => {
        if (released) {
          return;
        }
        released = true;
        entry.activeLeases -= 1;
        if (entry.expired && entry.activeLeases === 0) {
          await this.#remove(entry, true);
        }
      },
    });
  }

  async cleanupExpired(): Promise<number> {
    const now = this.#dependencies.clock.now();
    const expiredEntries = [...this.#entries.values()].filter(
      (entry) => entry.expired || entry.expiresAtMs <= now,
    );
    let removed = 0;
    for (const entry of expiredEntries) {
      const existedBefore = this.#entries.has(entry.id);
      await this.#expire(entry);
      if (existedBefore && !this.#entries.has(entry.id)) {
        removed += 1;
      }
    }
    return removed;
  }

  async dispose(): Promise<void> {
    const entries = [...this.#entries.values()];
    for (const entry of entries) {
      if (entry.expirationTimer !== undefined) {
        this.#dependencies.clock.clearTimeout(entry.expirationTimer);
        entry.expirationTimer = undefined;
      }
      await this.#remove(entry, false);
    }
    this.#expiredIds.clear();
  }

  get lastCleanupError(): Error | undefined {
    return this.#lastCleanupError;
  }

  get size(): number {
    return this.#entries.size;
  }

  async #expire(entry: ArtifactEntry): Promise<void> {
    if (!this.#entries.has(entry.id)) {
      return;
    }
    entry.expired = true;
    if (entry.activeLeases === 0) {
      await this.#remove(entry, true);
    }
  }

  async #remove(entry: ArtifactEntry, rememberExpiration: boolean): Promise<void> {
    if (entry.removalPromise !== undefined) {
      return entry.removalPromise;
    }
    if (entry.expirationTimer !== undefined) {
      this.#dependencies.clock.clearTimeout(entry.expirationTimer);
      entry.expirationTimer = undefined;
    }
    entry.removalPromise = rm(entry.directory, { force: true, recursive: true })
      .then(() => {
        this.#entries.delete(entry.id);
        if (rememberExpiration) {
          this.#rememberExpired(entry.id);
        }
      })
      .catch((error: unknown) => {
        this.#lastCleanupError = asError(error);
        throw error;
      })
      .finally(() => {
        entry.removalPromise = undefined;
      });
    return entry.removalPromise;
  }

  #generateUniqueId(): string {
    for (let attempt = 0; attempt < MAX_ID_GENERATION_ATTEMPTS; attempt += 1) {
      const id = this.#dependencies.idGenerator();
      if (ARTIFACT_ID_PATTERN.test(id) && !this.#entries.has(id) && !this.#expiredIds.has(id)) {
        return id;
      }
    }
    throw new RunnerFailure("INTERNAL_ERROR", "无法生成安全的编译制品标识。");
  }

  #rememberExpired(id: string): void {
    this.#expiredIds.add(id);
    const maxTombstones = this.#limits.maxArtifacts * 2;
    while (this.#expiredIds.size > maxTombstones) {
      const oldest = this.#expiredIds.values().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      this.#expiredIds.delete(oldest);
    }
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
