/**
 * Tests for EvidenceMetadataPanel (#486)
 *
 * Covers: metadata display, CID copy button, external link, video fallback
 * flow, and WCAG-critical attributes.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EvidenceMetadataPanel } from "../EvidenceMetadataPanel";

// navigator.clipboard is not available in jsdom by default.
const writeTextMock = jest.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: writeTextMock },
  configurable: true,
});

const BASE_PROPS = {
  cid: "QmTestCid1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ01",
  fileName: "delivery-proof.mp4",
  checksum: "abc123def456",
  mimeType: "video/mp4",
  uploadedAt: "2026-05-14T10:00:00.000Z",
};

describe("EvidenceMetadataPanel", () => {
  it("renders the IPFS CID", () => {
    render(<EvidenceMetadataPanel {...BASE_PROPS} />);
    expect(screen.getByText(BASE_PROPS.cid)).toBeInTheDocument();
  });

  it("renders file name, mime type, and checksum metadata rows", () => {
    render(<EvidenceMetadataPanel {...BASE_PROPS} />);
    expect(screen.getByText("delivery-proof.mp4")).toBeInTheDocument();
    expect(screen.getByText("video/mp4")).toBeInTheDocument();
    expect(screen.getByText("abc123def456")).toBeInTheDocument();
  });

  it("renders formatted upload timestamp", () => {
    render(<EvidenceMetadataPanel {...BASE_PROPS} />);
    // Verify some formatted date text is present
    expect(screen.getByText(/May 14, 2026/)).toBeInTheDocument();
  });

  it("omits optional metadata rows when props are absent", () => {
    render(<EvidenceMetadataPanel cid={BASE_PROPS.cid} />);
    expect(screen.queryByText("delivery-proof.mp4")).not.toBeInTheDocument();
    expect(screen.queryByText("video/mp4")).not.toBeInTheDocument();
    expect(screen.queryByText("abc123def456")).not.toBeInTheDocument();
  });

  it("renders an external link to the Pinata gateway", () => {
    render(<EvidenceMetadataPanel {...BASE_PROPS} />);
    const link = screen.getByRole("link", {
      name: /view evidence on ipfs/i,
    });
    expect(link).toHaveAttribute(
      "href",
      `https://gateway.pinata.cloud/ipfs/${BASE_PROPS.cid}`,
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("copy button copies the CID and shows confirmation state", async () => {
    const user = userEvent.setup();
    render(<EvidenceMetadataPanel {...BASE_PROPS} />);

    const copyBtn = screen.getByRole("button", {
      name: /copy ipfs cid/i,
    });
    await user.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(BASE_PROPS.cid);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /cid copied/i }),
      ).toBeInTheDocument(),
    );
  });

  it("video element has accessible aria-label", () => {
    render(<EvidenceMetadataPanel {...BASE_PROPS} />);
    expect(
      screen.getByLabelText(/uploaded delivery evidence video/i),
    ).toBeInTheDocument();
  });

  it("figure element has accessible aria-label", () => {
    render(<EvidenceMetadataPanel {...BASE_PROPS} />);
    expect(
      screen.getByRole("figure", { name: /evidence video preview/i }),
    ).toBeInTheDocument();
  });

  it("shows fallback UI when all gateways fail", () => {
    render(
      <EvidenceMetadataPanel
        {...BASE_PROPS}
        videoSrc="https://gateway.pinata.cloud/ipfs/TestCid"
        fallbackSrcs={[]}
      />,
    );

    const video = screen.getByLabelText(/uploaded delivery evidence video/i);
    // Simulate all gateways failing
    fireEvent.error(video);

    expect(screen.getByText(/video unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open on ipfs/i })).toBeInTheDocument();
  });

  it("renders without crashing when only cid is provided", () => {
    expect(() =>
      render(<EvidenceMetadataPanel cid="QmMinimalCidAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" />),
    ).not.toThrow();
  });
});
