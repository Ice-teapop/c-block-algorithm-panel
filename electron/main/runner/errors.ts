import type { RunnerErrorCode } from "../../../src/shared/api.js";

export class RunnerFailure extends Error {
  readonly code: RunnerErrorCode;

  constructor(code: RunnerErrorCode, message: string) {
    super(message);
    this.name = "RunnerFailure";
    this.code = code;
  }
}
