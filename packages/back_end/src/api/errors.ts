import type { FastifyError, FastifyReply } from 'fastify';
import { AppError, type ErrorCode } from '@meihua/shared';

const HTTP_BY_CODE: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  CAST_INVALID_INPUT: 400,
  SECRET_SETTING_REJECTED: 400,
  NO_API_KEY: 400,
  CASE_EXISTS: 409,
  CASE_IN_FLIGHT: 409,
  PERSON_NOT_FOUND: 404,
  KB_NOT_LOADED: 503,
  LLM_UNAVAILABLE: 503,
  LLM_RATE_LIMIT: 429,
  LLM_TIMEOUT: 504,
  LLM_HTTP_ERROR: 502,
  LLM_UNAUTHORIZED: 502,
  LLM_BAD_JSON: 502,
  LLM_EMPTY_RESPONSE: 502,
  LLM_ABORT: 502,
  STEP_FAILED: 502,
  INTERNAL: 500,
};

export function sendAppError(reply: FastifyReply, err: unknown): void {
  if (err instanceof AppError) {
    const status = HTTP_BY_CODE[err.code] ?? 500;
    reply.status(status).send({
      code: err.code,
      message: err.message,
      ...(err.retryAfterMs != null ? { retryAfterMs: err.retryAfterMs } : {}),
    });
    return;
  }
  const e = err as FastifyError;
  reply.status(500).send({
    code: 'INTERNAL',
    message: e?.message ?? 'internal error',
  });
}
