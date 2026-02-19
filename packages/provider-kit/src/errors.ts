import type { EnforcementErrorPayload, PolicyFailureReason } from "@kite-stack/shared-types";

export class EnforcementError extends Error {
  public readonly statusCode: number;
  public readonly payload: EnforcementErrorPayload;

  constructor(statusCode: number, code: PolicyFailureReason, message: string, actionId?: string, routeId?: string) {
    super(message);
    this.statusCode = statusCode;
    this.payload = {
      code,
      message,
      actionId,
      routeId,
    };
  }
}
