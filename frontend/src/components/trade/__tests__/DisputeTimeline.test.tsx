/**
 * Tests for DisputeTimeline (#487)
 *
 * Covers: event rendering, chronological order, screen-reader annotations,
 * live region for in-progress states, and empty state.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { DisputeTimeline, type DisputeTimelineEvent } from "../DisputeTimeline";

const EVENTS: DisputeTimelineEvent[] = [
  {
    id: "evt-1",
    status: "OPEN",
    label: "Dispute opened",
    timestamp: "2026-05-14T08:00:00.000Z",
    note: "Initiator: GBK...001",
  },
  {
    id: "evt-2",
    status: "UNDER_REVIEW",
    label: "Assigned to mediator",
    timestamp: "2026-05-14T10:00:00.000Z",
  },
  {
    id: "evt-3",
    status: "RESOLVED",
    label: "Dispute resolved",
    timestamp: "2026-05-15T14:30:00.000Z",
    note: "Split: 70/30 in seller's favour",
  },
];

describe("DisputeTimeline", () => {
  it("renders all events", () => {
    render(<DisputeTimeline events={EVENTS} currentStatus="RESOLVED" />);
    expect(screen.getByText("Dispute opened")).toBeInTheDocument();
    expect(screen.getByText("Assigned to mediator")).toBeInTheDocument();
    expect(screen.getByText("Dispute resolved")).toBeInTheDocument();
  });

  it("renders event notes", () => {
    render(<DisputeTimeline events={EVENTS} currentStatus="RESOLVED" />);
    expect(screen.getByText("Initiator: GBK...001")).toBeInTheDocument();
    expect(screen.getByText("Split: 70/30 in seller's favour")).toBeInTheDocument();
  });

  it("renders formatted timestamps inside <time> elements with dateTime attribute", () => {
    render(<DisputeTimeline events={EVENTS} currentStatus="RESOLVED" />);
    const timeElements = document.querySelectorAll("time");
    expect(timeElements.length).toBeGreaterThanOrEqual(EVENTS.length);
    // First event timestamp
    expect(timeElements[0]).toHaveAttribute(
      "dateTime",
      "2026-05-14T08:00:00.000Z",
    );
  });

  it("renders an ordered list with aria-label for screen readers", () => {
    render(<DisputeTimeline events={EVENTS} currentStatus="RESOLVED" />);
    expect(
      screen.getByRole("list", { name: /dispute timeline/i }),
    ).toBeInTheDocument();
  });

  it("includes screen-reader-only step announcements", () => {
    render(<DisputeTimeline events={EVENTS} currentStatus="RESOLVED" />);
    // sr-only text includes step numbers
    const srElements = document.querySelectorAll(".sr-only");
    const srTexts = Array.from(srElements).map((el) => el.textContent ?? "");
    expect(srTexts.some((t) => t.includes("Step 1 of 3"))).toBe(true);
    expect(srTexts.some((t) => t.includes("Step 3 of 3"))).toBe(true);
  });

  it("shows a live region for OPEN disputes", () => {
    render(<DisputeTimeline events={EVENTS} currentStatus="OPEN" />);
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion.textContent).toMatch(/open/i);
  });

  it("shows a live region for UNDER_REVIEW disputes", () => {
    render(<DisputeTimeline events={EVENTS} currentStatus="UNDER_REVIEW" />);
    const liveRegion = screen.getByRole("status");
    expect(liveRegion.textContent).toMatch(/under mediator review/i);
  });

  it("omits the live region for RESOLVED / CLOSED disputes", () => {
    const { rerender } = render(
      <DisputeTimeline events={EVENTS} currentStatus="RESOLVED" />,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    rerender(<DisputeTimeline events={EVENTS} currentStatus="CLOSED" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows empty state when no events are provided", () => {
    render(<DisputeTimeline events={[]} currentStatus="OPEN" />);
    expect(
      screen.getByText(/no timeline events recorded/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders status badges for each event", () => {
    render(<DisputeTimeline events={EVENTS} currentStatus="RESOLVED" />);
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Under review")).toBeInTheDocument();
    expect(screen.getAllByText("Resolved").length).toBeGreaterThan(0);
  });
});
