import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { AppError, ErrorCode, StructuredErrorPayload, isAppError } from '../errors/errorCodes';
import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER, TracedRequest } from './correlationId.middleware';
import { appLogger } from './logger';
import { parseSupportedLocale, getLocalizedMessage } from '../lib/errorLocalization';

function withLocalization(
  payload: StructuredErrorPayload,
  code: string,
  acceptLanguage: string | undefined,
): StructuredErrorPayload {
  const locale = parseSupportedLocale(acceptLanguage);
  if (!locale) return payload;
  const localizedMessage = getLocalizedMessage(code, locale);
  if (!localizedMessage) return payload;
  return { ...payload, localizedMessage };
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const traced = req as TracedRequest;

  const correlationId =
    traced.correlationId ||
    (res.getHeader(CORRELATION_ID_HEADER) as string | undefined);
  const requestId =
    traced.requestId ||
    (res.getHeader(REQUEST_ID_HEADER) as string | undefined);
  const path = req.path;

  if (isAppError(err)) {
    const appErr = err as AppError;
    appLogger.warn({
      code: appErr.code,
      message: appErr.message,
      requestId,
      details: appErr.details,
    }, 'AppError handled');
    const payload = withLocalization(
      appErr.toPayload(path, requestId, correlationId),
      appErr.code,
      req.headers['accept-language'],
    );
    return res.status(appErr.statusCode).json(payload);
  }

  if (err instanceof z.ZodError) {
    const payload = withLocalization(
      {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Validation failed',
        details: { errors: (err as { errors: unknown }).errors },
        timestamp: new Date().toISOString(),
        path,
        ...(correlationId && { correlationId }),
        ...(requestId && { requestId }),
      } as StructuredErrorPayload,
      ErrorCode.VALIDATION_ERROR,
      req.headers['accept-language'],
    );
    return res.status(400).json(payload);
  }

  const status = (err && typeof (err as any).status === 'number') ? (err as any).status : 500;
  const message = env.NODE_ENV === 'production' ? 'Internal server error' : (err instanceof Error ? err.message : String(err));

  const errForLogging = err instanceof Error ? err : new Error(String(err));
  appLogger.error({
    err: errForLogging,
    requestId,
    stack: errForLogging.stack,
  }, 'Unhandled error');

  const payload = withLocalization(
    {
      code: ErrorCode.INTERNAL_ERROR,
      message,
      details: {},
      timestamp: new Date().toISOString(),
      path,
      ...(correlationId && { correlationId }),
      ...(requestId && { requestId }),
    } as StructuredErrorPayload,
    ErrorCode.INTERNAL_ERROR,
    req.headers['accept-language'],
  );

  res.status(status).json(payload);
}
