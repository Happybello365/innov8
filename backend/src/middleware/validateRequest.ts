import { Request, Response, NextFunction } from "express";
import { AppError, ErrorCode } from "../errors/errorCodes";
import { normalizeCurrencyFields } from "../validators/currency.validators";

type ParseAsyncSchema = {
  parseAsync: (input: unknown) => Promise<unknown>;
};

type ZodLikeIssue = {
  path: Array<string | number>;
  message: string;
};

function getZodLikeIssues(error: unknown): ZodLikeIssue[] | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const err = error as any;
  if (Array.isArray(err.issues)) {
    return err.issues;
  }
  if (Array.isArray(err.errors)) {
    return err.errors;
  }

  return null;
}

function sanitizeString(value: string): string {
  return value
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === "object") {
    return sanitizeObject(value as Record<string, unknown>);
  }
  return value;
}

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    sanitized[key] = sanitizeValue(obj[key]);
  }
  return sanitized;
}

export const validateRequest = (schema: {
  body?: ParseAsyncSchema;
  query?: ParseAsyncSchema;
  params?: ParseAsyncSchema;
}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schema.body && req.body) {
        req.body = normalizeCurrencyFields(req.body);
        const parsed = await schema.body.parseAsync(req.body);
        req.body = sanitizeValue(parsed);
      }
      if (schema.query && req.query) {
        const normalizedQuery = normalizeCurrencyFields(req.query);
        const parsed = await schema.query.parseAsync(normalizedQuery);
        Object.defineProperty(req, 'query', {
          value: sanitizeValue(parsed),
          writable: true,
          configurable: true,
        });
      }
      if (schema.params && req.params) {
        req.params = normalizeCurrencyFields(req.params) as any;
        const parsed = await schema.params.parseAsync(req.params);
        req.params = sanitizeValue(parsed) as any;
      }
      next();
    } catch (error) {
      const issues = getZodLikeIssues(error);
      if (issues?.length) {
        const firstError = issues[0];
        const fieldName = firstError.path.join(".");
        const message = fieldName ? `${fieldName}: ${firstError.message}` : firstError.message;
        next(
          new AppError(ErrorCode.VALIDATION_ERROR, message, 400, {
            errors: issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          }),
        );
        return;
      }
      next(error);
    }
  };
};
