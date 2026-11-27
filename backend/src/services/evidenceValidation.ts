import { env } from "../config/env";

/** Evidence MIME types accepted for upload (issue #469). */
export const EVIDENCE_ALLOWED_MIME_TYPES = ["video/mp4", "video/webm"] as const;
export type EvidenceMimeType = (typeof EVIDENCE_ALLOWED_MIME_TYPES)[number];

export interface EvidenceValidationResult {
    ok: boolean;
    reason?: string;
    sniffedMimeType?: EvidenceMimeType | null;
}

/** Detect the container type from magic bytes. */
export function sniffEvidenceMimeType(buffer: Buffer): EvidenceMimeType | null {
    if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
        return "video/mp4";
    }
    if (
        buffer.length >= 4 &&
        buffer[0] === 0x1a &&
        buffer[1] === 0x45 &&
        buffer[2] === 0xdf &&
        buffer[3] === 0xa3
    ) {
        return "video/webm";
    }
    return null;
}

/**
 * Validate evidence MIME and size. Used before upload (declared vs sniffed
 * content) and after upload (content fetched back from the gateway), so both
 * paths apply exactly the same rules.
 */
export function validateEvidenceContent(
    buffer: Buffer,
    declaredMimeType: string | undefined,
    maxBytes: number = env.EVIDENCE_MAX_BYTES,
): EvidenceValidationResult {
    if (!buffer || buffer.length === 0) {
        return { ok: false, reason: "Empty file" };
    }
    if (buffer.length > maxBytes) {
        return { ok: false, reason: "File too large" };
    }
    if (declaredMimeType && !(EVIDENCE_ALLOWED_MIME_TYPES as readonly string[]).includes(declaredMimeType)) {
        return { ok: false, reason: "Unsupported file type" };
    }
    const sniffed = sniffEvidenceMimeType(buffer);
    if (!sniffed) {
        return { ok: false, reason: "Unrecognised file content", sniffedMimeType: null };
    }
    if (declaredMimeType && sniffed !== declaredMimeType) {
        return { ok: false, reason: "File content does not match declared MIME type", sniffedMimeType: sniffed };
    }
    return { ok: true, sniffedMimeType: sniffed };
}
