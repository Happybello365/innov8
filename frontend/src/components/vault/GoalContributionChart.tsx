"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import { goalsApi, type GoalContributionItem } from "@/lib/api/goals";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoalContributionChartProps {
  /** Goal ID to fetch contributions for. */
  goalId: string;
  /** Auth JWT token. */
  token: string;
  /** Optional class name for the outer wrapper. */
  className?: string;
}

interface ChartDataPoint {
  /** Short display label for the X-axis, e.g. "Oct 26" */
  label: string;
  /** Numeric amount in USDC */
  amount: number;
  /** Raw ISO timestamp (kept for the accessible table) */
  createdAt: string;
  /** Full amount string as it came from the API */
  amountUsdc: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toChartData(contributions: GoalContributionItem[]): ChartDataPoint[] {
  return contributions.map((c) => ({
    label: new Date(c.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    amount: parseFloat(c.amountUsdc),
    createdAt: c.createdAt,
    amountUsdc: c.amountUsdc,
  }));
}

function formatUsdc(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border-default bg-card px-3 py-2 shadow-card text-xs">
      <p className="font-semibold text-text-primary mb-0.5">{label}</p>
      <p className="text-gold">{formatUsdc(payload[0].value ?? 0)}</p>
    </div>
  );
}

// ─── Empty / single-point states ─────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      data-testid="contribution-chart-empty"
      className="flex flex-col items-center justify-center gap-3 py-10 text-center"
      role="status"
      aria-label="No contribution history yet"
    >
      <div className="w-10 h-10 rounded-xl bg-bg-elevated border border-border-default flex items-center justify-center">
        <svg
          className="w-5 h-5 text-text-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M3 17l4-8 4 4 4-6 4 10" />
        </svg>
      </div>
      <p className="text-sm font-medium text-text-primary">No contributions yet</p>
      <p className="text-xs text-text-secondary">
        Contributions to this goal will appear here over time.
      </p>
    </div>
  );
}

function SingleContributionState({ point }: { point: ChartDataPoint }) {
  return (
    <div
      data-testid="contribution-chart-single"
      className="flex flex-col items-center justify-center gap-3 py-10 text-center"
      role="status"
      aria-label="Single contribution recorded"
    >
      <div className="rounded-xl border border-gold/30 bg-gold-muted px-5 py-4">
        <p className="text-xs uppercase tracking-widest text-text-muted mb-1">
          First Contribution
        </p>
        <p className="text-2xl font-bold text-gold">{formatUsdc(point.amount)}</p>
        <p className="text-xs text-text-secondary mt-1">{point.label}</p>
      </div>
      <p className="text-xs text-text-muted">
        More contributions will form a chart over time.
      </p>
    </div>
  );
}

// ─── Accessible text summary ──────────────────────────────────────────────────

function AccessibleSummary({ data }: { data: ChartDataPoint[] }) {
  if (data.length === 0) return null;

  const total = data.reduce((sum, d) => sum + d.amount, 0);
  const latest = data[data.length - 1];

  return (
    <div className="sr-only" aria-live="polite">
      <h3>Goal Contribution History Summary</h3>
      <p>
        {data.length} contribution{data.length !== 1 ? "s" : ""} totalling{" "}
        {formatUsdc(total)}.
      </p>
      <p>
        Latest contribution of {formatUsdc(latest.amount)} on {latest.label}.
      </p>
      <table>
        <caption>All contributions</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Amount (USDC)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <td>{new Date(d.createdAt).toLocaleString()}</td>
              <td>{d.amountUsdc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GoalContributionChart({
  goalId,
  token,
  className,
}: GoalContributionChartProps) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContributions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await goalsApi.getContributions(token, goalId, { limit: 100 });
      setData(toChartData(page.data));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load contribution history",
      );
    } finally {
      setLoading(false);
    }
  }, [token, goalId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchContributions();
  }, [fetchContributions]);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div
        data-testid="contribution-chart-loading"
        className={`rounded-2xl border border-border-default bg-card p-5 ${className ?? ""}`}
        aria-busy="true"
        aria-label="Loading contribution history"
      >
        <div className="h-4 w-36 rounded bg-bg-elevated animate-pulse mb-4" />
        <div className="h-40 rounded bg-bg-elevated animate-pulse" />
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div
        data-testid="contribution-chart-error"
        className={`rounded-2xl border border-status-danger/20 bg-status-danger/10 p-5 ${className ?? ""}`}
        role="alert"
      >
        <p className="text-sm text-status-danger">{error}</p>
        <button
          type="button"
          onClick={() => void fetchContributions()}
          className="mt-2 text-xs text-status-danger/80 underline hover:text-status-danger"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="contribution-chart-container"
      className={`rounded-2xl border border-border-default bg-card p-5 ${className ?? ""}`}
    >
      {/* Title row */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary">
          Contribution History
        </h3>
        {data.length > 0 && (
          <span className="text-xs text-text-muted">
            {data.length} contribution{data.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Accessible summary (screen-reader only) */}
      <AccessibleSummary data={data} />

      {/* Chart body */}
      {data.length === 0 ? (
        <EmptyState />
      ) : data.length === 1 ? (
        <SingleContributionState point={data[0]} />
      ) : (
        <ResponsiveContainer
          width="100%"
          height={200}
          aria-label={`Bar chart of ${data.length} goal contributions`}
        >
          <BarChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            role="img"
            aria-label="Goal contribution history bar chart"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--color-text-muted, #888)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => `$${v}`}
              tick={{ fontSize: 10, fill: "var(--color-text-muted, #888)" }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar
              dataKey="amount"
              fill="var(--color-gold, #f5a623)"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
              name="Amount (USDC)"
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
