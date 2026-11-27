import express from "express";
import request from "supertest";
import type { InternalAxiosRequestConfig } from "axios";
import {
  correlationIdMiddleware,
  CORRELATION_ID_HEADER,
  TracedRequest,
} from "../../middleware/correlationId.middleware";
import { withCorrelationId, getJobCorrelationId, correlationHeaders } from "../../lib/correlation";
import { TracedHttpClient } from "../../lib/traced-http-client";

/**
 * End-to-end propagation: HTTP request → queued job → worker → outbound
 * webhook / external-service call. The same correlation ID must survive
 * every hop, and unsafe IDs must never be forwarded.
 */
describe("Correlation ID propagation (integration)", () => {
  type Job = { name: string; data: Record<string, unknown> };
  let queue: Job[];
  let outbound: InternalAxiosRequestConfig[];
  let client: TracedHttpClient;
  let app: express.Express;

  const runWorker = async () => {
    for (const job of queue.splice(0)) {
      const correlationId = getJobCorrelationId(job.data);
      await client.post("https://hooks.example.com/trade", { tradeId: job.data.tradeId }, {
        headers: correlationHeaders(correlationId),
      });
    }
  };

  beforeEach(() => {
    queue = [];
    outbound = [];
    client = new TracedHttpClient(undefined, "test-service");
    client.getAxiosInstance().defaults.adapter = async (config) => {
      outbound.push(config);
      return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };

    app = express();
    app.use(express.json());
    app.use(correlationIdMiddleware);
    // HTTP → job
    app.post("/trades/:id/notify", (req, res) => {
      queue.push({ name: "webhook", data: withCorrelationId({ tradeId: req.params.id }, (req as TracedRequest).correlationId) });
      res.status(202).json({ queued: true });
    });
    // Inbound webhook → synchronous external-service call
    app.post("/webhooks/inbound", async (req, res) => {
      await client.get("https://ext.example.com/status", {
        headers: correlationHeaders((req as TracedRequest).correlationId),
      });
      res.json({ ok: true });
    });
  });

  it("carries a caller-supplied ID through HTTP, job, worker and outbound webhook", async () => {
    const id = "trace-abc-123";
    const res = await request(app).post("/trades/t1/notify").set(CORRELATION_ID_HEADER, id);
    expect(res.headers[CORRELATION_ID_HEADER]).toBe(id);
    expect(queue[0].data.correlationId).toBe(id);

    await runWorker();
    expect(outbound).toHaveLength(1);
    expect(outbound[0].headers[CORRELATION_ID_HEADER]).toBe(id);
    // per-hop request id is fresh, never the correlation id
    expect(outbound[0].headers["x-request-id"]).toBeDefined();
    expect(outbound[0].headers["x-request-id"]).not.toBe(id);
  });

  it("propagates a server-generated ID when the caller sends none", async () => {
    const res = await request(app).post("/trades/t2/notify");
    const generated = res.headers[CORRELATION_ID_HEADER];
    expect(generated).toMatch(/^[0-9a-f-]{36}$/);
    await runWorker();
    expect(outbound[0].headers[CORRELATION_ID_HEADER]).toBe(generated);
  });

  it("forwards the inbound webhook's ID to external-service calls", async () => {
    const res = await request(app).post("/webhooks/inbound").set(CORRELATION_ID_HEADER, "wh-777");
    expect(res.status).toBe(200);
    expect(res.headers[CORRELATION_ID_HEADER]).toBe("wh-777");
    expect(outbound[0].headers[CORRELATION_ID_HEADER]).toBe("wh-777");
  });

  it("replaces an unsafe inbound ID instead of propagating it", async () => {
    const res = await request(app).post("/trades/t3/notify").set(CORRELATION_ID_HEADER, "bad id; drop table");
    const id = res.headers[CORRELATION_ID_HEADER];
    expect(id).not.toContain("drop");
    await runWorker();
    expect(outbound[0].headers[CORRELATION_ID_HEADER]).toBe(id);
  });

  it("drops invalid IDs from job payloads and outbound headers", () => {
    expect(withCorrelationId({ a: 1 }, "x\r\ny")).toEqual({ a: 1 });
    expect(getJobCorrelationId({ correlationId: "<script>" })).toBeUndefined();
    expect(getJobCorrelationId(null)).toBeUndefined();
    expect(correlationHeaders(undefined)).toEqual({});
  });
});
