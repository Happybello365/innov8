"use client";

import { useState, useEffect } from "react";
import {
  VaultHero,
  ReleaseSequenceCard,
  VaultValueCard,
  ContractManifestCard,
  AuditLogCard,
  NetworkBackboneCard,
  VaultFooter,
  PaymentOverviewCard,
} from "@/components/vault";
import { Skeleton } from "@/components/ui/Skeleton";
import { BentoCard } from "@/components/ui/BentoCard";

// Mock data - in production, this would come from an API or database
const VAULT_DATA = {
  escrowId: "8492-AX",
  custodyType: "Institutional Custody",
  status: "Funds Locked",
  isSecured: true,
  sequenceId: "882-AF",
  steps: [
    { label: "Agreement", date: "Oct 12, 2023", status: "completed" as const },
    {
      label: "Audit Phase",
      date: "Processing...",
      status: "in-progress" as const,
    },
    { label: "Final Release", date: "Est. Nov 04", status: "pending" as const },
  ],
  vaultValue: 2480000,
  currency: "USD",
  isInsured: true,
  contract: {
    id: "AMN-772-VLT-09",
    agreementDate: "September 24, 2023",
    settlementType: "Immediate / Fiat-Backed",
    originParty: {
      initials: "GB",
      name: "Global Biotech Inc.",
      color: "teal" as const,
    },
    recipientParty: {
      initials: "NS",
      name: "Nova Solutions Ltd.",
      color: "emerald" as const,
    },
  },
  auditLog: [
    {
      type: "biometric" as const,
      title: "Biometric validation passed",
      metadata: "2m ago • 192.168.1.44",
    },
    {
      type: "multi-sig" as const,
      title: "Multi-sig request broadcast",
      metadata: "1h ago • ID: 494022",
    },
    {
      type: "ledger" as const,
      title: "Ledger synchronization",
      metadata: "Yesterday • Block 182,990",
    },
  ],
  networkDescription:
    "Secured and powered by the Stellar network for instantaneous cross-border settlement and verifiable transparency.",
  paymentOverview: {
    totalCngn: 2480000,
    ngnRate: 1580,
  },
  footer: {
    version: "V4.8.2",
    links: [
      { label: "Privacy Protocol", href: "#" },
      { label: "Compliance", href: "#" },
      { label: "Audit Report", href: "#" },
    ],
    socialLinks: [
      { platform: "x" as const, href: "#" },
      { platform: "instagram" as const, href: "#" },
      { platform: "tiktok" as const, href: "#" },
      { platform: "discord" as const, href: "#" },
    ],
  },
};

function VaultDashboardSkeleton() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Hero skeleton */}
        <div className="mb-8 flex flex-col gap-3" aria-hidden="true">
          <Skeleton variant="rect" height={28} width={200} />
          <Skeleton variant="rect" height={16} width={320} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Row 1: Release Sequence + Vault Value */}
          <div className="lg:col-span-8" aria-hidden="true">
            <BentoCard title="" icon={null} glowVariant="gold" className="h-full">
              <div className="flex flex-col gap-4 py-2">
                <Skeleton variant="rect" height={16} width={120} />
                <div className="flex items-center justify-around gap-4 pt-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex flex-col items-center gap-3">
                      <Skeleton variant="circle" width={64} height={64} />
                      <Skeleton variant="rect" height={12} width={80} />
                      <Skeleton variant="rect" height={10} width={60} />
                    </div>
                  ))}
                </div>
              </div>
            </BentoCard>
          </div>
          <div className="lg:col-span-4" aria-hidden="true">
            <BentoCard title="" icon={null} glowVariant="emerald" className="h-full">
              <div className="flex flex-col gap-4 py-2">
                <Skeleton variant="rect" height={12} width={120} />
                <Skeleton variant="rect" height={48} width="100%" />
                <Skeleton variant="rect" height={80} width="100%" />
                <Skeleton variant="rect" height={48} width="100%" />
              </div>
            </BentoCard>
          </div>

          {/* Row 2: Contract Manifest + Audit Log */}
          <div className="lg:col-span-7" aria-hidden="true">
            <BentoCard title="" icon={null} glowVariant="gold" className="h-full">
              <div className="flex flex-col gap-4 py-2">
                <Skeleton variant="rect" height={16} width={160} />
                <div className="flex items-center gap-3">
                  <Skeleton variant="circle" width={40} height={40} />
                  <div className="flex flex-col gap-2 flex-1">
                    <Skeleton variant="rect" height={12} width="70%" />
                    <Skeleton variant="rect" height={10} width="50%" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton variant="circle" width={40} height={40} />
                  <div className="flex flex-col gap-2 flex-1">
                    <Skeleton variant="rect" height={12} width="70%" />
                    <Skeleton variant="rect" height={10} width="50%" />
                  </div>
                </div>
                <Skeleton variant="rect" height={36} width="100%" />
              </div>
            </BentoCard>
          </div>
          <div className="lg:col-span-5" aria-hidden="true">
            <BentoCard title="" icon={null} glowVariant="emerald" className="h-full">
              <div className="flex flex-col gap-4 py-2">
                <Skeleton variant="rect" height={16} width={100} />
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton variant="circle" width={40} height={40} />
                    <div className="flex flex-col gap-2 flex-1">
                      <Skeleton variant="rect" height={12} width="80%" />
                      <Skeleton variant="rect" height={10} width="60%" />
                    </div>
                  </div>
                ))}
              </div>
            </BentoCard>
          </div>

          {/* Row 3: Payment Overview */}
          <div className="lg:col-span-5" aria-hidden="true">
            <BentoCard title="" icon={null} glowVariant="gold" className="h-full">
              <div className="flex flex-col gap-3 py-2">
                <Skeleton variant="rect" height={16} width={140} />
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <Skeleton variant="rect" height={12} width="45%" />
                    <Skeleton variant="rect" height={12} width="30%" />
                  </div>
                ))}
                <Skeleton variant="rect" height={40} width="100%" />
              </div>
            </BentoCard>
          </div>

          {/* Row 4: Network Backbone */}
          <div className="lg:col-span-12" aria-hidden="true">
            <BentoCard title="" icon={null} glowVariant="gold" className="h-full">
              <div className="flex flex-col gap-3 py-2">
                <Skeleton variant="rect" height={16} width={160} />
                <Skeleton variant="rect" height={12} width="100%" />
                <Skeleton variant="rect" height={12} width="80%" />
              </div>
            </BentoCard>
          </div>
        </div>
      </main>
    </div>
  );
}

export interface VaultDashboardProps {
  /** Simulate loading state; defaults to false (real usage: pass true while API data is in-flight). */
  isLoading?: boolean;
}

export function VaultDashboard({ isLoading = false }: VaultDashboardProps) {
  const [loading, setLoading] = useState(isLoading);

  useEffect(() => {
    setLoading(isLoading);
  }, [isLoading]);

  if (loading) {
    return <VaultDashboardSkeleton />;
  }

  const handleReleaseFunds = () => {
    // Handle release funds action
  };

  const handleExportPdf = () => {
    // Handle PDF export
  };

  const handleViewClauses = () => {
    // Handle view clauses
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <main className="max-w-7xl mx-auto px-6 py-10">
        <VaultHero
          escrowId={VAULT_DATA.escrowId}
          custodyType={VAULT_DATA.custodyType}
          status={VAULT_DATA.status}
          isSecured={VAULT_DATA.isSecured}
        />

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Row 1: Release Sequence (2 cols) + Vault Value (1 col) */}
          <div className="lg:col-span-8">
            <ReleaseSequenceCard
              sequenceId={VAULT_DATA.sequenceId}
              steps={VAULT_DATA.steps}
            />
          </div>
          <div className="lg:col-span-4">
            <VaultValueCard
              value={VAULT_DATA.vaultValue}
              currency={VAULT_DATA.currency}
              isInsured={VAULT_DATA.isInsured}
              onReleaseFunds={handleReleaseFunds}
            />
          </div>

          {/* Row 2: Contract Manifest (2 cols) + Audit Log (1 col) */}
          <div className="lg:col-span-7">
            <ContractManifestCard
              contractId={VAULT_DATA.contract.id}
              agreementDate={VAULT_DATA.contract.agreementDate}
              settlementType={VAULT_DATA.contract.settlementType}
              originParty={VAULT_DATA.contract.originParty}
              recipientParty={VAULT_DATA.contract.recipientParty}
              onExportPdf={handleExportPdf}
              onViewClauses={handleViewClauses}
            />
          </div>
          <div className="lg:col-span-5">
            <AuditLogCard entries={VAULT_DATA.auditLog} isLiveSync />
          </div>

          {/* Row 3: Payment Overview */}
          <div className="lg:col-span-5">
            <PaymentOverviewCard
              totalCngn={VAULT_DATA.paymentOverview.totalCngn}
              ngnRate={VAULT_DATA.paymentOverview.ngnRate}
            />
          </div>

          {/* Row 4: Network Backbone (full width) */}
          <div className="lg:col-span-12">
            <NetworkBackboneCard description={VAULT_DATA.networkDescription} />
          </div>
        </div>

        <VaultFooter
          version={VAULT_DATA.footer.version}
          links={VAULT_DATA.footer.links}
          socialLinks={VAULT_DATA.footer.socialLinks}
        />
      </main>
    </div>
  );
}
