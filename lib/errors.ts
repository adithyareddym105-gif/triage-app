import type { Usage } from "./schemas";

export class ConfigError extends Error {}

export class UpstreamError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

/** The model answered, but not in the required format (after one retry). */
export class InvalidOutputError extends Error {
  constructor(message: string, public usage: Usage, public cost: number) {
    super(message);
  }
}
