export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type ErrorInfo = {
  message: string;
  rateLimited: boolean;
};

const RATE_LIMIT_MESSAGE =
  "You're browsing a little too quickly. Please wait about a minute, then try again, stocks you've already viewed should still load from cache.";

export function messageForHttpError(status: number, body: string): string {
  if (status === 429) return RATE_LIMIT_MESSAGE;

  try {
    const parsed = JSON.parse(body) as {
      detail?: string | { msg?: string }[];
      error?: string;
      message?: string;
    };
    if (typeof parsed.detail === "string" && parsed.detail.length > 0) {
      return parsed.detail;
    }
    if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) {
      return parsed.detail[0].msg;
    }
    const msg = parsed.error ?? parsed.message;
    if (typeof msg === "string" && msg.length > 0 && msg.length < 240) {
      return msg;
    }
  } catch {
  }

  const trimmed = body.trim();
  if (trimmed && trimmed.length < 240 && !trimmed.startsWith("{")) {
    return trimmed;
  }

  if (status >= 500) {
    return "The server is temporarily unavailable. Please try again in a moment.";
  }

  return `Something went wrong (HTTP ${status}). Please try again.`;
}

export function getErrorInfo(error: unknown): ErrorInfo {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      rateLimited: error.status === 429,
    };
  }
  if (error instanceof Error) {
    return { message: error.message, rateLimited: false };
  }
  return { message: String(error), rateLimited: false };
}

// Render cold-start / unreachable API (e.g. Render free tier waking up).
export function isServerWakeupError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 502 || error.status === 503 || error.status === 504;
  }
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("load failed")
    );
  }
  return false;
}
