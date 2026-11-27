import os from "os";
import { metrics } from "@opentelemetry/api";
import { prisma } from "./db";
import { appLogger } from "../middleware/logger";

/**
 * Connection-pool observability for the Supabase/Postgres pool managed by
 * Prisma's query engine. Reads Prisma's built-in pool metrics (requires the
 * `metrics` preview feature in schema.prisma) and exposes:
 *
 *   - usage       — open / busy / idle connections
 *   - saturation  — busy / configured `connection_limit` (0..1)
 *   - wait        — queries currently waiting for a free connection
 *   - checkout    — wait-for-connection duration histogram (ms)
 *
 * Only aggregate counts are reported: no connection strings, hosts or
 * credentials ever leave this module.
 */

interface PrismaMetric {
  key: string;
  value: number | { buckets: [number, number][]; sum: number; count: number };
}
interface PrismaMetricsJson {
  counters: PrismaMetric[];
  gauges: PrismaMetric[];
  histograms: PrismaMetric[];
}
interface PrismaWithMetrics {
  $metrics?: { json(): Promise<PrismaMetricsJson> };
}

export interface DbPoolSnapshot {
  status: "ok" | "unavailable";
  connectionLimit: number;
  open: number;
  busy: number;
  idle: number;
  waiting: number;
  /** busy / connectionLimit, clamped to [0, 1]. */
  saturation: number;
  /** Mean time a query waited to check out a connection, in ms. */
  checkoutWaitAvgMs: number | null;
  checkoutWaitCount: number;
  collectedAt: string;
}

/**
 * Prisma's default pool size is `num_physical_cpus * 2 + 1`; an explicit
 * `connection_limit` query parameter on DATABASE_URL overrides it.
 */
export function resolveConnectionLimit(
  databaseUrl: string | undefined = process.env.DATABASE_URL,
  cpuCount: number = os.cpus().length,
): number {
  if (databaseUrl) {
    try {
      const raw = new URL(databaseUrl).searchParams.get("connection_limit");
      const parsed = raw ? Number.parseInt(raw, 10) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    } catch {
      // Malformed URL: fall through to Prisma's default. Never log the URL.
    }
  }
  return Math.max(cpuCount, 1) * 2 + 1;
}

function gauge(m: PrismaMetricsJson, key: string): number {
  const found = m.gauges.find((g) => g.key === key);
  return typeof found?.value === "number" ? found.value : 0;
}

export function buildDbPoolSnapshot(m: PrismaMetricsJson, connectionLimit: number): DbPoolSnapshot {
  const busy = gauge(m, "prisma_pool_connections_busy");
  const wait = m.histograms.find((h) => h.key === "prisma_client_queries_wait_histogram_ms");
  const waitValue = wait && typeof wait.value === "object" ? wait.value : undefined;
  return {
    status: "ok",
    connectionLimit,
    open: gauge(m, "prisma_pool_connections_open"),
    busy,
    idle: gauge(m, "prisma_pool_connections_idle"),
    waiting: gauge(m, "prisma_client_queries_wait"),
    saturation: connectionLimit > 0 ? Math.min(Math.max(busy / connectionLimit, 0), 1) : 0,
    checkoutWaitAvgMs: waitValue && waitValue.count > 0 ? waitValue.sum / waitValue.count : null,
    checkoutWaitCount: waitValue?.count ?? 0,
    collectedAt: new Date().toISOString(),
  };
}

function unavailable(connectionLimit: number): DbPoolSnapshot {
  return {
    status: "unavailable",
    connectionLimit,
    open: 0,
    busy: 0,
    idle: 0,
    waiting: 0,
    saturation: 0,
    checkoutWaitAvgMs: null,
    checkoutWaitCount: 0,
    collectedAt: new Date().toISOString(),
  };
}

let lastSnapshot: DbPoolSnapshot | null = null;

/** Collects a fresh pool snapshot; never throws. */
export async function getDbPoolSnapshot(
  client: PrismaWithMetrics = prisma as unknown as PrismaWithMetrics,
): Promise<DbPoolSnapshot> {
  const limit = resolveConnectionLimit();
  try {
    if (!client.$metrics) {
      lastSnapshot = unavailable(limit);
    } else {
      lastSnapshot = buildDbPoolSnapshot(await client.$metrics.json(), limit);
    }
  } catch (error) {
    appLogger.warn({ err: (error as Error).message }, "[DbPool] failed to collect pool metrics");
    lastSnapshot = unavailable(limit);
  }
  return lastSnapshot;
}

let gaugesRegistered = false;

/**
 * Registers OpenTelemetry observable gauges (scraped via the Prometheus
 * exporter) and refreshes the cached snapshot every `intervalMs`.
 * Returns a stop function for graceful shutdown.
 */
export function startDbPoolMetrics(intervalMs = 15_000): () => void {
  if (!gaugesRegistered) {
    gaugesRegistered = true;
    const meter = metrics.getMeter("innov8-backend");
    const observe = (name: string, description: string, unit: string, pick: (s: DbPoolSnapshot) => number | null) =>
      meter.createObservableGauge(name, { description, unit }).addCallback((result) => {
        const value = lastSnapshot ? pick(lastSnapshot) : null;
        if (value !== null) result.observe(value);
      });
    observe("db_pool_connections_open", "Open connections in the DB pool", "{connection}", (s) => s.open);
    observe("db_pool_connections_busy", "Checked-out (busy) DB pool connections", "{connection}", (s) => s.busy);
    observe("db_pool_connections_idle", "Idle DB pool connections", "{connection}", (s) => s.idle);
    observe("db_pool_queries_waiting", "Queries waiting for a DB pool connection", "{query}", (s) => s.waiting);
    observe("db_pool_saturation_ratio", "Busy connections / connection_limit", "1", (s) => s.saturation);
    observe("db_pool_checkout_wait_avg_ms", "Mean wait to check out a DB connection", "ms", (s) => s.checkoutWaitAvgMs);
  }

  void getDbPoolSnapshot();
  const timer = setInterval(() => void getDbPoolSnapshot(), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
