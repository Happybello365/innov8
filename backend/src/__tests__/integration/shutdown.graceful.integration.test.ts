import http from "http";
import express from "express";
import type { AddressInfo } from "net";
import { ShutdownOrchestrator } from "../../lib/shutdown";

/**
 * Real HTTP server + orchestrator: verifies that on a termination signal
 * in-flight requests drain to completion, new connections are refused,
 * workers stop only after the server has drained, and the process exits 0.
 * Failure paths (hanging step, throwing worker) exit 1.
 */
describe("Backend graceful shutdown (integration)", () => {
  let exitSpy: jest.SpyInstance;
  let server: http.Server;
  let port: number;
  let release: () => void;
  const events: string[] = [];

  const get = (path: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.get({ port, path, agent: false }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on("error", reject);
    });

  beforeEach(async () => {
    events.length = 0;
    exitSpy = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const app = express();
    app.get("/slow", (_req, res) => {
      events.push("request-started");
      release = () => {
        events.push("request-finished");
        res.set("Connection", "close").send("done");
      };
    });
    server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(() => {
    exitSpy.mockRestore();
    if (server.listening) server.close();
  });

  it("drains in-flight requests, refuses new ones, then stops workers in order", async () => {
    const orchestrator = new ShutdownOrchestrator({ drainTimeoutMs: 2_000, forceExitTimeoutMs: 5_000 });
    const inFlight = get("/slow");
    await new Promise((r) => setTimeout(r, 50));
    expect(events).toEqual(["request-started"]);

    const done = orchestrator.shutdown("SIGTERM", server, [
      { name: "worker", stop: async () => void events.push("worker-stopped") },
      { name: "database", stop: async () => void events.push("db-disconnected") },
    ]);
    expect(orchestrator.isShuttingDown()).toBe(true);

    await new Promise((r) => setTimeout(r, 20));
    await expect(get("/slow")).rejects.toThrow(); // listener closed
    expect(events).not.toContain("worker-stopped"); // waits for drain

    release();
    await expect(inFlight).resolves.toEqual({ status: 200, body: "done" });
    await done;

    expect(events).toEqual(["request-started", "request-finished", "worker-stopped", "db-disconnected"]);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("ignores a second signal while shutdown is already in progress", async () => {
    const orchestrator = new ShutdownOrchestrator({ drainTimeoutMs: 1_000, forceExitTimeoutMs: 5_000 });
    const stop = jest.fn();
    const first = orchestrator.shutdown("SIGTERM", server, [{ name: "worker", stop }]);
    await orchestrator.shutdown("SIGINT", server, [{ name: "worker", stop }]);
    await first;
    expect(stop).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledTimes(1);
  });

  it("exits 1 when a worker hangs past the drain timeout", async () => {
    const orchestrator = new ShutdownOrchestrator({ drainTimeoutMs: 50, forceExitTimeoutMs: 5_000 });
    const after = jest.fn();
    await orchestrator.shutdown("SIGTERM", server, [
      { name: "stuck-worker", stop: () => new Promise<void>(() => undefined) },
      { name: "database", stop: after },
    ]);
    expect(after).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits 1 when a worker fails to close", async () => {
    const orchestrator = new ShutdownOrchestrator({ drainTimeoutMs: 1_000, forceExitTimeoutMs: 5_000 });
    await orchestrator.shutdown("SIGTERM", server, [
      { name: "worker", stop: async () => { throw new Error("close failed"); } },
    ]);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
