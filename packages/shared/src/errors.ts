export type ErrorCode =
  | 'NO_API_KEY'
  | 'LLM_UNAVAILABLE'
  | 'LLM_HTTP_ERROR'
  | 'LLM_TIMEOUT'
  | 'LLM_ABORT'
  | 'LLM_BAD_JSON'
  | 'LLM_EMPTY_RESPONSE'
  | 'LLM_RATE_LIMIT'
  | 'LLM_UNAUTHORIZED'
  | 'CASE_IN_FLIGHT'
  | 'CASE_EXISTS'
  | 'PERSON_NOT_FOUND'
  | 'SECRET_SETTING_REJECTED'
  | 'CAST_INVALID_INPUT'
  | 'KB_NOT_LOADED'
  | 'STEP_FAILED'
  | 'INVALID_REQUEST'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: ErrorCode;
  retryAfterMs?: number;

  constructor(code: ErrorCode, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export class LlmError extends AppError {
  constructor(code: ErrorCode, message: string, retryAfterMs?: number) {
    super(code, message, retryAfterMs);
    this.name = 'LlmError';
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
