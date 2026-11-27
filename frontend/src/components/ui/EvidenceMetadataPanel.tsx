"use client";

/**
 * EvidenceMetadataPanel (#486)
 *
 * Previews an uploaded evidence video and displays file metadata safely:
 * - File name (if available)
 * - SHA-256 checksum (if available)
 * - IPFS CID with an external Pinata gateway link
 * - MIME type and upload time
 *
 * The video element carries aria-label and role="figure" so screen readers
 * announce it as a media object rather than an interactive control.
 * The CID is rendered in a monospace truncated span with a copy button so
 * users can share it without manually selecting overflowing text.
 */

import React, { useCallback, useState } from "react";
import { ExternalLink, FileVideo, Copy, CheckCircle } from "lucide-react";
import { BentoCard } from "./BentoCard";

export interface EvidenceMetadataPanelProps {
  /** IPFS CID — required; the rest are optional enrichment. */
  cid: string;
  /** Original file name as recorded at upload time. */
  fileName?: string;
  /** Hex-encoded SHA-256 digest of the file. */
  checksum?: string;
  /** MIME type (e.g. "video/mp4"). */
  mimeType?: string;
  /** ISO-8601 upload timestamp. */
  uploadedAt?: string;
  /**
   * Full gateway URL for video playback. When omitted the component falls
   * back to `https://gateway.pinata.cloud/ipfs/{cid}`.
   */
  videoSrc?: string;
  /**
   * Alternative gateway URLs tried in order if the primary src fails.
   * Defaults to ipfs.io as a fallback.
   */
  fallbackSrcs?: string[];
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function MetaRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-2 border-b border-border-default last:border-b-0">
      <dt className="text-xs uppercase tracking-wide text-text-muted shrink-0 w-24">
        {label}
      </dt>
      <dd
        className={`text-xs text-text-primary text-right break-all ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

export function EvidenceMetadataPanel({
  cid,
  fileName,
  checksum,
  mimeType,
  uploadedAt,
  videoSrc,
  fallbackSrcs = ["https://ipfs.io/ipfs"],
}: EvidenceMetadataPanelProps) {
  const primarySrc =
    videoSrc ?? `https://gateway.pinata.cloud/ipfs/${cid}`;
  const allSrcs = [primarySrc, ...fallbackSrcs.map((base) => `${base}/${cid}`)];

  const [srcIndex, setSrcIndex] = useState(0);
  const [videoState, setVideoState] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [copied, setCopied] = useState(false);

  const currentSrc = allSrcs[srcIndex] ?? primarySrc;

  const handleVideoError = useCallback(() => {
    if (srcIndex + 1 < allSrcs.length) {
      setSrcIndex((i) => i + 1);
      setVideoState("loading");
    } else {
      setVideoState("failed");
    }
  }, [srcIndex, allSrcs.length]);

  async function handleCopyCid() {
    try {
      await navigator.clipboard.writeText(cid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — no-op
    }
  }

  const pinataLink = `https://gateway.pinata.cloud/ipfs/${cid}`;

  return (
    <BentoCard
      title="Evidence Preview"
      icon={<FileVideo className="w-5 h-5" />}
      glowVariant="gold"
    >
      {/* Video preview */}
      <figure
        aria-label="Evidence video preview"
        className="relative rounded-lg overflow-hidden bg-black aspect-video mb-4"
      >
        {videoState === "failed" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-4">
            <FileVideo className="w-8 h-8 text-status-danger" aria-hidden />
            <p className="text-xs text-text-muted">
              Video unavailable — view on IPFS directly.
            </p>
            <a
              href={pinataLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gold underline underline-offset-2 hover:text-gold-hover"
            >
              Open on IPFS
            </a>
          </div>
        ) : (
          <>
            {videoState === "loading" && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/60 z-10"
                aria-hidden
              >
                <div className="animate-spin w-7 h-7 border-2 border-gold border-t-transparent rounded-full" />
              </div>
            )}
            <video
              key={currentSrc}
              src={currentSrc}
              controls
              aria-label="Uploaded delivery evidence video"
              className="w-full h-full object-contain"
              onLoadStart={() => setVideoState("loading")}
              onCanPlay={() => setVideoState("ready")}
              onError={handleVideoError}
            />
          </>
        )}
      </figure>

      {/* Metadata table */}
      <section aria-label="Evidence file metadata">
        <dl className="divide-y divide-border-default">
          {fileName && <MetaRow label="File" value={fileName} />}
          {mimeType && <MetaRow label="Type" value={mimeType} />}
          {uploadedAt && (
            <MetaRow label="Uploaded" value={formatTimestamp(uploadedAt)} />
          )}
          {checksum && (
            <MetaRow label="SHA-256" value={checksum} mono />
          )}
        </dl>
      </section>

      {/* CID row with copy + external link */}
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-bg-elevated px-3 py-2">
        <span className="text-xs font-mono text-text-secondary truncate flex-1 min-w-0">
          {cid}
        </span>
        <button
          type="button"
          onClick={() => void handleCopyCid()}
          aria-label={copied ? "CID copied" : "Copy IPFS CID to clipboard"}
          className="shrink-0 text-text-muted hover:text-text-primary transition-colors focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2 rounded"
        >
          {copied ? (
            <CheckCircle className="w-4 h-4 text-status-success" aria-hidden />
          ) : (
            <Copy className="w-4 h-4" aria-hidden />
          )}
        </button>
        <a
          href={pinataLink}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View evidence on IPFS (opens in new tab)"
          className="shrink-0 text-gold hover:text-gold-hover transition-colors"
        >
          <ExternalLink className="w-4 h-4" aria-hidden />
        </a>
      </div>
    </BentoCard>
  );
}

export default EvidenceMetadataPanel;
