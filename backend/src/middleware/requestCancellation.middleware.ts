/**
 * Request cancellation propagation middleware (issue #450).
 *
 * Attaches an `AbortSignal` to each request so repository calls, RPC
 * operations, and queue dispatches can observe client disconnection and bail
 * out early instead of consuming resources for a response nobody will receive.
 *
 * Usage
 * -----
 * Mount the middleware early in the Express stack:
 *
 *   app.use(requestCancellationMiddleware);
 *
 * Then read the signal in any async handler:
 *
 *   const signal = getRequestSignal(req);
 *   await someOperation({ signal });
 *
 * Helpers
 * -------
 * `withCancellation(signal, promise)` wraps a promise so it rejects with
 * `RequestCancelledError` when the signal fires first. Use this for legacy
 * code that does not natively accept an `AbortSignal`.
 *
 * `isCancellationError(err)` returns `true` for `RequestCancelledError` and
 * native `AbortError`. Route error handlers should check this and reply 499
 * instead of logging a spurious 500.
 */

import { NextFunction, Request, Response } from "express";

// ---------------------------------------------------------------------------
// Private property keys — no string pollution on req
// ---------------------------------------------------------------------------

const kSignal = Symbol("requestAbortSignal");
const kController = Symbol("requestAbortController");

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/** Thrown by `withCancellation` when the client disconnects before the
 *  wrapped operation resolves. */
export class RequestCancelledError extends Error {
  readonly status = 499;
  constructor(message = "Client closed the request") {
    super(message);
    this.name = "RequestCancelledError";
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that creates an `AbortController` per request and aborts
 * it when the client disconnects (before `res.finish`).
 */
export function requestCancellationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const controller = new AbortController();
  (req as any)[kController] = controller;
  (req as any)[kSignal] = controller.signal;

  const onClose = () => {
    // Only abort if the response has not already been fully sent.
    if (!res.writableEnded) {
      controller.abort(new RequestCancelledError());
    }
  };

  // `close` fires when the underlying socket closes before a full response
  // was delivered — the canonical client-disconnect event in Node/Express.
  res.once("close", onClose);
  // Remove the listener after a normal finish so the controller is not held
  // in memory past the request lifecycle.
  res.once("finish", () => res.removeListener("close", onClose));

  next();
}

// ---------------------------------------------------------------------------
// Accessor
// ---------------------------------------------------------------------------

/**
 * Returns the `AbortSignal` attached to `req` by `requestCancellationMiddleware`.
 * Returns `undefined` when the middleware is not mounted (graceful degradation
 * — callers must handle the undefined case).
 */
export function getRequestSignal(req: Request): AbortSignal | undefined {
  return (req as any)[kSignal] as AbortSignal | undefined;
}

// ---------------------------------------------------------------------------
// withCancellation helper
// ---------------------------------------------------------------------------

/**
 * Race `operation` against `signal`. If the signal fires first, the returned
 * promise rejects with `RequestCancelledError`. If the operation resolves or
 * rejects first, the abort listener is cleaned up and the result forwarded.
 *
 * Passing `undefined` for `signal` (middleware not mounted) is a no-op —
 * the original promise is returned unchanged.
 */
export function withCancellation<T>(
  signal: AbortSignal | undefined,
  operation: Promise<T>,
): Promise<T> {
  if (!signal) return operation;

  if (signal.aborted) {
    return Promise.reject(
      signal.reason instanceof Error
        ? signal.reason
        : new RequestCancelledError(),
    );
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new RequestCancelledError(),
      );
    };

    signal.addEventListener("abort", onAbort, { once: true });

    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// isCancellationError helper
// ---------------------------------------------------------------------------

/**
 * Returns `true` for errors that originate from client disconnection:
 * - `RequestCancelledError` (from `withCancellation`)
 * - Native `AbortError` from `fetch` or `AbortController.abort()`
 * - Any error whose `.name === "AbortError"`
 *
 * Route error handlers should log these at `debug` level and reply 499.
 */
export function isCancellationError(err: unknown): boolean {
  if (err instanceof RequestCancelledError) return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}
