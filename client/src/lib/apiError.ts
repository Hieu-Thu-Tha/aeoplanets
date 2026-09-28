export const AI_USAGE_CAP_REACHED = "AI_USAGE_CAP_REACHED";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly responseMessage: string,
    public readonly code?: string,
  ) {
    // Preserve the existing format for consumers that inspect Error.message.
    super(`${status}: ${responseMessage}`);
    this.name = "ApiError";
  }
}

export function apiErrorFromResponse(
  status: number,
  statusText: string,
  body: string,
): ApiError {
  let message = body || statusText;
  let code: string | undefined;

  try {
    const parsed = JSON.parse(body) as { message?: unknown; code?: unknown };
    if (typeof parsed.message === "string") message = parsed.message;
    if (typeof parsed.code === "string") code = parsed.code;
  } catch {
    // Keep non-JSON response text as-is.
  }

  return new ApiError(status, message, code);
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.responseMessage;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function isAiUsageCapError(error: unknown): boolean {
  return error instanceof ApiError && error.code === AI_USAGE_CAP_REACHED;
}
