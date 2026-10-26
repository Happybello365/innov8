/**
 * #272 — the backend reads the evidence-per-party cap from contract state
 * instead of hardcoding it, and falls back safely when chain state is
 * unavailable.
 */
import { Networks, nativeToScVal, rpc } from "@stellar/stellar-sdk";
import {
  ContractService,
  DEFAULT_MAX_EVIDENCE_PER_PARTY,
  __resetRpcServerFactoryForTests,
  __setRpcServerFactoryForTests,
} from "../services/contract.service";
import { __resetRetrySleepForTests, __setRetrySleepForTests } from "../lib/retry";
import { TradeEvidenceListService } from "../services/trade.evidence.service";

function buildService(simulateTransaction: jest.Mock, contractId = process.env.AMANA_ESCROW_CONTRACT_ID!) {
  const server = { simulateTransaction } as unknown as rpc.Server;
  __setRpcServerFactoryForTests(() => server);
  return new ContractService("https://rpc.example.com", contractId, process.env.USDC_CONTRACT_ID!, Networks.TESTNET);
}

describe("ContractService.getMaxEvidencePerParty (#272)", () => {
  beforeEach(() => __setRetrySleepForTests(jest.fn().mockResolvedValue(undefined)));
  afterEach(() => {
    __resetRetrySleepForTests();
    __resetRpcServerFactoryForTests();
  });

  it("reads the cap from the contract's read-only getter", async () => {
    const simulate = jest.fn().mockResolvedValue({ result: { retval: nativeToScVal(12, { type: "u32" }) } });
    const service = buildService(simulate);

    await expect(service.getMaxEvidencePerParty()).resolves.toEqual({ value: 12, source: "chain" });
    const tx = simulate.mock.calls[0][0];
    const op = tx.operations[0];
    expect(op.func.invokeContract().functionName().toString()).toBe("get_max_evidence_per_party");
  });

  it("caches the on-chain value between calls", async () => {
    const simulate = jest.fn().mockResolvedValue({ result: { retval: nativeToScVal(10, { type: "u32" }) } });
    const service = buildService(simulate);
    await service.getMaxEvidencePerParty(1_000);
    await service.getMaxEvidencePerParty(2_000);
    expect(simulate).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default when the simulation errors", async () => {
    const simulate = jest.fn().mockResolvedValue({ error: "HostError: contract not found" });
    const service = buildService(simulate);
    await expect(service.getMaxEvidencePerParty()).resolves.toEqual({
      value: DEFAULT_MAX_EVIDENCE_PER_PARTY,
      source: "default",
    });
  });

  it("falls back to the default when the getter returns a nonsensical value", async () => {
    const simulate = jest.fn().mockResolvedValue({ result: { retval: nativeToScVal(0, { type: "u32" }) } });
    await expect(buildService(simulate).getMaxEvidencePerParty()).resolves.toMatchObject({ source: "default" });
  });

  it("does not call RPC when no contract id is configured", async () => {
    const simulate = jest.fn();
    await expect(buildService(simulate, "").getMaxEvidencePerParty()).resolves.toMatchObject({ source: "default" });
    expect(simulate).not.toHaveBeenCalled();
  });

  it("default matches MAX_EVIDENCE_PER_PARTY in the contract source", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path");
    const lib = fs.readFileSync(path.join(__dirname, "../../../contracts/amana_escrow/src/lib.rs"), "utf8");
    const match = lib.match(/pub const MAX_EVIDENCE_PER_PARTY: u32 = (\d+);/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(DEFAULT_MAX_EVIDENCE_PER_PARTY);
  });
});

describe("TradeEvidenceListService limits (#272)", () => {
  it("includes the on-chain cap in list responses", async () => {
    const prisma = {
      trade: { findUnique: jest.fn().mockResolvedValue({ tradeId: "t", buyerAddress: "b", sellerAddress: "s", status: "DISPUTED" }) },
      dispute: { findUnique: jest.fn().mockResolvedValue({ tradeId: "t" }) },
      tradeEvidence: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      deliveryManifest: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const reader = { getMaxEvidencePerParty: jest.fn().mockResolvedValue({ value: 7, source: "chain" }) };
    const service = new TradeEvidenceListService(prisma as never, { getSignedFileUrl: jest.fn() } as never, reader);

    const result = await service.list("t", "b", { type: "video", page: 1, limit: 20 });
    expect(result.limits).toEqual({ maxEvidencePerParty: 7, source: "chain" });
  });
});
