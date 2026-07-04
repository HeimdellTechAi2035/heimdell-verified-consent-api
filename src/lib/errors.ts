// Phase 1 foundations — JSON API error response helpers

import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYMENT_REQUIRED"
  | "TOO_MANY_REQUESTS"
  | "UNPROCESSABLE_ENTITY"
  | "INTERNAL_SERVER_ERROR";

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details !== undefined && { details }),
      },
    },
    { status }
  );
}

export const errors = {
  badRequest: (message: string, details?: unknown) =>
    apiError("BAD_REQUEST", message, 400, details),

  unauthorized: (message = "Unauthorized") =>
    apiError("UNAUTHORIZED", message, 401),

  forbidden: (message = "Forbidden") =>
    apiError("FORBIDDEN", message, 403),

  notFound: (message = "Not found") =>
    apiError("NOT_FOUND", message, 404),

  conflict: (message: string) =>
    apiError("CONFLICT", message, 409),

  paymentRequired: (message = "Insufficient credits") =>
    apiError("PAYMENT_REQUIRED", message, 402),

  tooManyRequests: (message = "Too many requests") =>
    apiError("TOO_MANY_REQUESTS", message, 429),

  unprocessable: (message: string, details?: unknown) =>
    apiError("UNPROCESSABLE_ENTITY", message, 422, details),

  internal: (message = "Internal server error") =>
    apiError("INTERNAL_SERVER_ERROR", message, 500),
};
