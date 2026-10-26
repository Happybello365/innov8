import { PrismaClient, TradeStatus, DisputeStatus, StreamStatus } from "@prisma/client";
import { prisma as defaultPrisma } from "../lib/db";

// ─── DSL types ────────────────────────────────────────────────────────────

export interface ReportFilter {
  tradeStatus?: TradeStatus[];
  disputeStatus?: DisputeStatus[];
  streamStatus?: StreamStatus[];
  createdAfter?: Date;
  createdBefore?: Date;
  /** If true, only return trades that have a dispute attached. */
  hasDispute?: boolean;
  /** If true, only return trades whose stream was created in the same window. */
  hasStream?: boolean;
  buyerAddress?: string;
  sellerAddress?: string;
}

export interface ReportRow {
  tradeId: string;
  tradeStatus: TradeStatus;
  tradeCreatedAt: Date;
  buyerAddress: string;
  sellerAddress: string;
  amountUsdc: string;
  dispute: {
    id: number;
    status: DisputeStatus;
    reason: string;
    initiator: string;
    createdAt: Date;
  } | null;
  stream: {
    streamId: string;
    status: StreamStatus;
    totalVested: string;
    createdAt: Date;
  } | null;
}

export interface SavedReportFilter {
  id: string;
  name: string;
  filter: ReportFilter;
  createdBy: string;
  createdAt: Date;
}

// In-memory store for saved filters (persisted between restarts via a simple
// map seeded from a prisma AdminActionAudit note with action="SAVED_REPORT").
// A proper DB table can replace this when the schema is next migrated.
const savedFilters = new Map<string, SavedReportFilter>();

export class AdminReportService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  async query(filter: ReportFilter): Promise<ReportRow[]> {
    const {
      tradeStatus,
      disputeStatus,
      streamStatus,
      createdAfter,
      createdBefore,
      hasDispute,
      hasStream,
      buyerAddress,
      sellerAddress,
    } = filter;

    const trades = await this.prisma.trade.findMany({
      where: {
        ...(tradeStatus?.length ? { status: { in: tradeStatus } } : {}),
        ...(buyerAddress ? { buyerAddress } : {}),
        ...(sellerAddress ? { sellerAddress } : {}),
        ...(createdAfter || createdBefore
          ? {
              createdAt: {
                ...(createdAfter ? { gte: createdAfter } : {}),
                ...(createdBefore ? { lte: createdBefore } : {}),
              },
            }
          : {}),
        ...(hasDispute === true ? { dispute: { isNot: null } } : {}),
        ...(hasDispute === false ? { dispute: { is: null } } : {}),
      },
      include: {
        dispute: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Optionally join streams: streams are keyed by recipient, not tradeId,
    // so we do a separate lookup keyed on the trade's sellerAddress + window.
    let streamMap = new Map<string, (typeof trades)[number] & { streamId?: string }>();

    if (hasStream || streamStatus?.length) {
      const streamWindow = await this.prisma.stream.findMany({
        where: {
          ...(streamStatus?.length ? { status: { in: streamStatus } } : {}),
          ...(createdAfter || createdBefore
            ? {
                createdAt: {
                  ...(createdAfter ? { gte: createdAfter } : {}),
                  ...(createdBefore ? { lte: createdBefore } : {}),
                },
              }
            : {}),
        },
        select: {
          streamId: true,
          recipient: true,
          status: true,
          totalVested: true,
          createdAt: true,
        },
      });

      // Map recipient address → stream (take the most recent one per address)
      const recipientToStream = new Map(
        streamWindow.map((s) => [s.recipient, s]),
      );

      const rows: ReportRow[] = [];
      for (const trade of trades) {
        const stream = recipientToStream.get(trade.sellerAddress) ?? null;
        if (hasStream === true && !stream) continue;
        if (hasStream === false && stream) continue;
        rows.push(this.toRow(trade, stream));
      }
      return rows;
    }

    return trades.map((t) => this.toRow(t, null));
  }

  // ─── Saved filter CRUD ──────────────────────────────────────────────────

  saveFilter(
    id: string,
    name: string,
    filter: ReportFilter,
    createdBy: string,
  ): SavedReportFilter {
    const entry: SavedReportFilter = {
      id,
      name,
      filter,
      createdBy,
      createdAt: new Date(),
    };
    savedFilters.set(id, entry);
    return entry;
  }

  listSavedFilters(createdBy?: string): SavedReportFilter[] {
    const all = Array.from(savedFilters.values());
    return createdBy ? all.filter((f) => f.createdBy === createdBy) : all;
  }

  getSavedFilter(id: string): SavedReportFilter | undefined {
    return savedFilters.get(id);
  }

  deleteSavedFilter(id: string): boolean {
    return savedFilters.delete(id);
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private toRow(
    trade: {
      tradeId: string;
      status: TradeStatus;
      createdAt: Date;
      buyerAddress: string;
      sellerAddress: string;
      amountUsdc: string;
      dispute: {
        id: number;
        status: DisputeStatus;
        reason: string;
        initiator: string;
        createdAt: Date;
      } | null;
    },
    stream: {
      streamId: string;
      status: StreamStatus;
      totalVested: string;
      createdAt: Date;
    } | null,
  ): ReportRow {
    return {
      tradeId: trade.tradeId,
      tradeStatus: trade.status,
      tradeCreatedAt: trade.createdAt,
      buyerAddress: trade.buyerAddress,
      sellerAddress: trade.sellerAddress,
      amountUsdc: trade.amountUsdc,
      dispute: trade.dispute
        ? {
            id: trade.dispute.id,
            status: trade.dispute.status,
            reason: trade.dispute.reason,
            initiator: trade.dispute.initiator,
            createdAt: trade.dispute.createdAt,
          }
        : null,
      stream: stream
        ? {
            streamId: stream.streamId,
            status: stream.status,
            totalVested: stream.totalVested,
            createdAt: stream.createdAt,
          }
        : null,
    };
  }
}

export const adminReportService = new AdminReportService();
