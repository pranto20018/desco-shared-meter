import { NextResponse } from "next/server";
import { UnauthorizedError } from "./auth";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * Wraps a route handler so thrown errors become clean JSON instead of an
 * opaque 500. Auth failures map to 401; everything else logs server-side and
 * returns a generic message so internal details never reach the client.
 */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<NextResponse>
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return fail(error.message, 401);
      }
      if (error instanceof ValidationError) {
        return fail(error.message, 400);
      }
      console.error("[api]", error);
      const message =
        error instanceof Error && /TURSO_DATABASE_URL|SESSION_SECRET/.test(error.message)
          ? error.message // configuration errors are safe and useful to surface
          : "Something went wrong. Please try again.";
      return fail(message, 500);
    }
  };
}

export class ValidationError extends Error {}

export function requireString(value: unknown, field: string, max = 120): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${field} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new ValidationError(`${field} must be ${max} characters or fewer.`);
  }
  return trimmed;
}

export function requireNumber(
  value: unknown,
  field: string,
  { min = 0, max = 1e12 }: { min?: number; max?: number } = {}
): number {
  const num = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof num !== "number" || !Number.isFinite(num)) {
    throw new ValidationError(`${field} must be a number.`);
  }
  if (num < min || num > max) {
    throw new ValidationError(`${field} must be between ${min} and ${max}.`);
  }
  return num;
}
