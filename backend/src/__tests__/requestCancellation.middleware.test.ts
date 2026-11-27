/**
 * Tests for request cancellation propagation middleware (issue #450).
 */
import { EventEmitter } from "events";
import type { Request, Response, NextFunction } from "express";
import {
  requestCancellationMiddleware,
  getRequestSignal,
  withCancellation,
  isCancellationError,
  RequestCancelledError,
} from "../middleware/requestCancellation.middleware";

// ---------------------------------------------------------------------------
// Minimal Express request/response stubs
// ---------------------------------------------------------------------------

function makeReq(): Request {
  return {} as Request;
}

function makeRes(writableEnded = false): Response {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    writableEnded,
    removeListener: emitter.removeListener.bind(emitter),
    once: emitter.once.bind(emitter),
  }) as unknown as Response;
}

// ---------------------------------------------------------------------------
// requestCancellationMiddleware
// ---------------------------------------------------------------------------

describe("requestCancellationMiddleware", () => {
  it("calls next()", () => {
    const req = makeReq();
    const res = makeRes();
    const next: NextFunction = jest.fn();
    requestCancellationMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("attaches a non-aborted AbortSignal to the request", () => {
    const req = makeReq();
    const res = makeRes();
    requestCancellationMiddleware(req, res, jest.fn());
    const signal = getRequestSignal(req);
    expect(signal).toBeDefined();
    expect(signal!.aborted).toBe(false);
  });

  it("aborts the signal when res emits close before finish", () => {
    const req = makeReq();
    const res = makeRes(false);
    requestCancellationMiddleware(req, res, jest.fn());
    const signal = getRequestSignal(req)!;

    res.emit("close");

    expect(signal.aborted).toBe(true);
  });

  it("does not abort the signal when res emits finish then close", () => {
    const req = makeReq();
    const res = makeRes(false);
    requestCancellationMiddleware(req, res, jest.fn());
    const signal = getRequestSignal(req)!;

    // finish → removes the close listener, so close should not abort
    res.emit("finish");
    res.emit("close");

    expect(signal.aborted).toBe(false);
  });

  it("does not abort when res.writableEnded is true on close", () => {
    const req = makeReq();
    const res = makeRes(true); // response already written
    requestCancellationMiddleware(req, res, jest.fn());
    const signal = getRequestSignal(req)!;

    res.emit("close");

    expect(signal.aborted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getRequestSignal
// ---------------------------------------------------------------------------

describe("getRequestSignal", () => {
  it("returns undefined when middleware was not mounted", () => {
    const req = makeReq();
    expect(getRequestSignal(req)).toBeUndefined();
  });

  it("returns the signal after middleware runs", () => {
    const req = makeReq();
    const res = makeRes();
    requestCancellationMiddleware(req, res, jest.fn());
    expect(getRequestSignal(req)).toBeInstanceOf(AbortSignal);
  });
});

// ---------------------------------------------------------------------------
// withCancellation
// ---------------------------------------------------------------------------

describe("withCancellation", () => {
  it("resolves with the operation value when signal is undefined", async () => {
    const result = await withCancellation(undefined, Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("resolves with the operation value when signal is not aborted", async () => {
    const ctrl = new AbortController();
    const result = await withCancellation(ctrl.signal, Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("rejects immediately when signal is already aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort(new RequestCancelledError());
    await expect(
      withCancellation(ctrl.signal, new Promise(() => {})),
    ).rejects.toBeInstanceOf(RequestCancelledError);
  });

  it("rejects with RequestCancelledError when signal fires before operation resolves", async () => {
    const ctrl = new AbortController();
    const neverResolves = new Promise<string>(() => {});
    const race = withCancellation(ctrl.signal, neverResolves);
    ctrl.abort();
    await expect(race).rejects.toBeInstanceOf(RequestCancelledError);
  });

  it("forwards the operation error when operation rejects before signal fires", async () => {
    const ctrl = new AbortController();
    const opError = new Error("db error");
    await expect(
      withCancellation(ctrl.signal, Promise.reject(opError)),
    ).rejects.toBe(opError);
  });

  it("cleans up the abort listener after the operation resolves", async () => {
    const ctrl = new AbortController();
    const listenersBefore = (ctrl.signal as any).listenerCount?.("abort") ?? 0;
    await withCancellation(ctrl.signal, Promise.resolve("done"));
    // No new listeners should remain after resolution.
    const listenersAfter = (ctrl.signal as any).listenerCount?.("abort") ?? 0;
    expect(listenersAfter).toBe(listenersBefore);
  });

  it("propagates a custom reason when signal.reason is an Error", async () => {
    const ctrl = new AbortController();
    const reason = new RequestCancelledError("custom disconnect reason");
    ctrl.abort(reason);
    await expect(
      withCancellation(ctrl.signal, new Promise(() => {})),
    ).rejects.toBe(reason);
  });
});

// ---------------------------------------------------------------------------
// isCancellationError
// ---------------------------------------------------------------------------

describe("isCancellationError", () => {
  it("returns true for RequestCancelledError", () => {
    expect(isCancellationError(new RequestCancelledError())).toBe(true);
  });

  it("returns true for a native AbortError by name", () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    expect(isCancellationError(err)).toBe(true);
  });

  it("returns false for a generic Error", () => {
    expect(isCancellationError(new Error("something else"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isCancellationError(null)).toBe(false);
  });

  it("returns false for a plain string", () => {
    expect(isCancellationError("cancelled")).toBe(false);
  });

  it("RequestCancelledError carries status 499", () => {
    expect(new RequestCancelledError().status).toBe(499);
  });
});
