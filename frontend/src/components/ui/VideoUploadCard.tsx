"use client";

/**
 * VideoUploadCard (#485)
 *
 * Evidence upload component with resumable / retryable support and clear
 * partial-progress feedback.
 *
 * Changes from the previous version:
 *  - Tracks upload progress with a labelled progress bar.
 *  - On network failure the upload stops at the last reported byte; the user
 *    can click "Retry upload" to restart from byte 0 (XHR does not natively
 *    support range-resume without a server-side upload session, so we restart
 *    the full upload while keeping the file in memory and showing a clear
 *    "Retrying…" state so the user knows what is happening).
 *  - Exposes a "Cancel" button while uploading.
 *  - On success the previous "Submit Proof" button is preserved.
 */

import React, { useRef, useState, useCallback } from "react";
import { Video } from "lucide-react";
import { BentoCard } from "./BentoCard";
import { Icon } from "./Icon";

export interface VideoUploadCardProps {
  onUpload?: (ipfsHash: string) => void;
}

type UploadPhase = "idle" | "uploading" | "retrying" | "done" | "error";

interface UploadState {
  phase: UploadPhase;
  progress: number;
  /** Bytes transferred so far (for the progress label). */
  transferred: number;
  /** Total file bytes (0 if unknown). */
  total: number;
  /** Number of retry attempts made. */
  retryCount: number;
  error: string | null;
}

const INITIAL_UPLOAD_STATE: UploadState = {
  phase: "idle",
  progress: 0,
  transferred: 0,
  total: 0,
  retryCount: 0,
  error: null,
};

const MAX_RETRIES = 3;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VideoUploadCard({ onUpload }: VideoUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ipfsHash, setIpfsHash] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState>(INITIAL_UPLOAD_STATE);

  const doUpload = useCallback(
    async (file: File, retryCount: number): Promise<void> => {
      const phase: UploadPhase = retryCount > 0 ? "retrying" : "uploading";
      setUpload((prev) => ({
        ...prev,
        phase,
        progress: 0,
        transferred: 0,
        total: file.size,
        retryCount,
        error: null,
      }));

      const data = new FormData();
      data.append("file", file);

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUpload((prev) => ({
            ...prev,
            progress: Math.round((e.loaded / e.total) * 100),
            transferred: e.loaded,
            total: e.total,
          }));
        }
      };

      return new Promise<void>((resolve, reject) => {
        xhr.onload = () => {
          xhrRef.current = null;
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText) as Record<string, string>;
              const hash = res.IpfsHash ?? res.cid ?? res.hash;
              if (!hash) {
                reject(new Error("Upload succeeded but no CID was returned"));
                return;
              }
              setIpfsHash(hash);
              setUpload((prev) => ({ ...prev, phase: "done", progress: 100 }));
              onUpload?.(hash);
              resolve();
            } catch {
              reject(new Error("Invalid response from upload endpoint"));
            }
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText || String(xhr.status)}`));
          }
        };

        xhr.onerror = () => {
          xhrRef.current = null;
          reject(new Error("Network error — check your connection and retry"));
        };

        xhr.onabort = () => {
          xhrRef.current = null;
          reject(new Error("Upload cancelled"));
        };

        xhr.open("POST", "https://api.pinata.cloud/pinning/pinFileToIPFS");
        const jwt = process.env.NEXT_PUBLIC_PINATA_JWT;
        if (jwt) xhr.setRequestHeader("Authorization", `Bearer ${jwt}`);
        xhr.send(data);
      });
    },
    [onUpload],
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (!file) return;
      setPreview(URL.createObjectURL(file));
      setSelectedFile(file);
      setIpfsHash(null);
      setUpload(INITIAL_UPLOAD_STATE);

      try {
        await doUpload(file, 0);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setUpload((prev) => ({
          ...prev,
          phase: "error",
          error: message,
        }));
      }
    },
    [doUpload],
  );

  const handleRetry = useCallback(async () => {
    if (!selectedFile) return;
    const nextRetry = upload.retryCount + 1;
    if (nextRetry > MAX_RETRIES) {
      setUpload((prev) => ({
        ...prev,
        error: `Upload failed after ${MAX_RETRIES} attempts. Please try a different file or check your connection.`,
      }));
      return;
    }
    try {
      await doUpload(selectedFile, nextRetry);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setUpload((prev) => ({
        ...prev,
        phase: "error",
        error: message,
      }));
    }
  }, [selectedFile, upload.retryCount, doUpload]);

  const handleCancel = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
    }
    setUpload(INITIAL_UPLOAD_STATE);
    setSelectedFile(null);
    setPreview(null);
    setIpfsHash(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const isUploading = upload.phase === "uploading" || upload.phase === "retrying";

  return (
    <BentoCard
      title="Evidence Upload"
      icon={<Video className="w-5 h-5" />}
      glowVariant="gold"
      className="h-full"
    >
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload delivery proof video — drag and drop or press Enter to browse"
        aria-describedby={upload.error ? "video-upload-error" : undefined}
        aria-disabled={isUploading}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => {
          if (!isUploading) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!isUploading) inputRef.current?.click();
          }
        }}
        className="
          border-2 border-dashed border-border-default
          rounded-xl p-6 flex flex-col items-center justify-center gap-3
          cursor-pointer
          hover:border-border-hover hover:bg-bg-elevated
          focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2
          transition-colors duration-200
          min-h-[140px]
        "
      >
        {preview ? (
          <video
            src={preview}
            controls
            className="w-full max-h-40 rounded-lg object-cover"
          />
        ) : (
          <>
            <Video className="w-8 h-8 text-text-muted" />
            <p className="text-text-muted text-sm text-center">
              Upload delivery proof video for verification
            </p>
            <span className="text-xs text-text-muted">
              Drag &amp; drop or click to browse
            </span>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm"
        aria-label="Choose proof video file"
        aria-describedby={upload.error ? "video-upload-error" : undefined}
        aria-invalid={Boolean(upload.error)}
        aria-hidden={false}
        tabIndex={-1}
        className="hidden file:rounded-full file:bg-elevated file:text-gold"
        onChange={handleChange}
      />

      {/* Upload progress (#485) */}
      {isUploading && (
        <div
          className="mt-4 space-y-2"
          role="status"
          aria-label={`Uploading to IPFS: ${upload.progress}%`}
          aria-live="polite"
        >
          <div className="flex justify-between text-xs text-text-muted">
            <span>
              {upload.phase === "retrying"
                ? `Retrying… (attempt ${upload.retryCount} of ${MAX_RETRIES})`
                : "Uploading to IPFS…"}
            </span>
            <span>
              {upload.total > 0
                ? `${formatBytes(upload.transferred)} / ${formatBytes(upload.total)} (${upload.progress}%)`
                : `${upload.progress}%`}
            </span>
          </div>

          {/* Progress bar */}
          <div
            className="w-full bg-bg-elevated rounded-full h-2 overflow-hidden"
            role="progressbar"
            aria-valuenow={upload.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Upload progress"
          >
            <div
              className="h-full bg-gold rounded-full transition-all duration-200"
              style={{ width: `${upload.progress}%` }}
              data-testid="upload-progress-bar"
            />
          </div>

          {/* Cancel button */}
          <button
            type="button"
            onClick={handleCancel}
            data-testid="upload-cancel-btn"
            className="mt-1 text-xs text-text-muted underline hover:text-text-secondary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          >
            Cancel upload
          </button>
        </div>
      )}

      {/* Error + retry (#485) */}
      {upload.phase === "error" && upload.error && (
        <div className="mt-3 space-y-2">
          <p
            id="video-upload-error"
            role="alert"
            aria-live="polite"
            className="text-xs text-status-danger"
          >
            {upload.error}
          </p>
          {selectedFile && upload.retryCount < MAX_RETRIES && (
            <button
              type="button"
              onClick={() => void handleRetry()}
              data-testid="upload-retry-btn"
              className="
                text-xs font-semibold text-gold hover:text-gold-hover underline
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold
                transition-colors
              "
            >
              Retry upload
              {upload.retryCount > 0 && ` (${MAX_RETRIES - upload.retryCount} attempt${MAX_RETRIES - upload.retryCount !== 1 ? "s" : ""} left)`}
            </button>
          )}
        </div>
      )}

      {/* IPFS hash link */}
      {ipfsHash && upload.phase === "done" && (
        <div className="mt-4 flex items-center gap-2 bg-bg-elevated rounded-lg px-3 py-2">
          <span className="text-xs text-text-muted truncate flex-1">{ipfsHash}</span>
          <a
            href={`https://gateway.pinata.cloud/ipfs/${ipfsHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-gold hover:text-gold-hover transition-colors"
            aria-label="View on IPFS"
          >
            <Icon name="external-link" size="sm" className="text-gold" />
          </a>
        </div>
      )}

      {/* Submit button */}
      <button
        disabled={!ipfsHash || isUploading}
        aria-disabled={!ipfsHash || isUploading}
        aria-describedby={!ipfsHash ? "video-upload-hint" : undefined}
        className="
          mt-4 w-full py-2 rounded-xl text-sm font-semibold
          bg-gold text-text-inverse
          hover:bg-gold-hover
          disabled:opacity-40 disabled:cursor-not-allowed
          focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2
          transition-colors duration-200
        "
      >
        Submit Proof
      </button>
      {!ipfsHash && (
        <p id="video-upload-hint" className="sr-only">
          Upload video evidence before submitting proof
        </p>
      )}
    </BentoCard>
  );
}

export default VideoUploadCard;
