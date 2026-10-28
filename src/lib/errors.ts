import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "@/types";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message = "Bad request", details?: unknown) {
    return new AppError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Unauthorized", details?: unknown) {
    return new AppError(401, "UNAUTHORIZED", message, details);
  }

  static forbidden(
    message = "Forbidden: Insufficient permissions",
    details?: unknown,
  ) {
    return new AppError(403, "FORBIDDEN", message, details);
  }

  static notFound(message = "Resource not found", details?: unknown) {
    return new AppError(404, "NOT_FOUND", message, details);
  }

  static conflict(
    message = "Resource already exists or conflicts",
    details?: unknown,
  ) {
    return new AppError(409, "CONFLICT", message, details);
  }

  static internalError(message = "Internal server error", details?: unknown) {
    return new AppError(500, "INTERNAL_SERVER_ERROR", message, details);
  }
}

export const unauthorized = (message = "Unauthorized", details?: unknown) =>
  new AppError(401, "UNAUTHORIZED", message, details);

export const forbidden = (
  message = "Forbidden: Insufficient permissions",
  details?: unknown,
) => new AppError(403, "FORBIDDEN", message, details);

export const notFound = (message = "Resource not found", details?: unknown) =>
  new AppError(404, "NOT_FOUND", message, details);

export const badRequest = (message = "Bad request", details?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, details);

export const conflict = (
  message = "Resource already exists or conflicts",
  details?: unknown,
) => new AppError(409, "CONFLICT", message, details);

export const internalError = (
  message = "Internal server error",
  details?: unknown,
) => new AppError(500, "INTERNAL_SERVER_ERROR", message, details);

export function formatErrorResponse(
  code: string,
  message: string,
  details?: unknown,
): ApiError {
  return {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

export function handleApiError(error: unknown): NextResponse<ApiError> {
  unstable_rethrow(error);
  if (error instanceof AppError) {
    return NextResponse.json(
      formatErrorResponse(error.code, error.message, error.details),
      { status: error.statusCode },
    );
  }

  if (error instanceof ZodError) {
    const formattedErrors = error.issues.map((issue) => ({
      field: issue.path.map(String).join("."),
      message: issue.message,
    }));
    return NextResponse.json(
      formatErrorResponse(
        "VALIDATION_ERROR",
        "Validation failed",
        formattedErrors,
      ),
      { status: 400 },
    );
  }

  console.error("Unhandled API Error:", error);
  return NextResponse.json(
    formatErrorResponse(
      "INTERNAL_SERVER_ERROR",
      "An unexpected error occurred",
    ),
    { status: 500 },
  );
}
