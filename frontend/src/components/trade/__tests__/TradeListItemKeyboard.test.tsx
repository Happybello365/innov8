import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TradeListItem } from "../TradeListItem";

describe("TradeListItem — Complete Keyboard Row Actions & Focus Restoration (#494)", () => {
  const baseProps = {
    tradeId: "TRD-9988",
    commodity: "50 Bags Sesame Seeds",
    counterparty: { role: "Buyer", address: "GABC1234567890XYZ" },
    amountCngn: "25,000.00",
    status: "PENDING" as const,
    createdAt: "25 Nov 2026",
    onView: jest.fn(),
    onDeposit: jest.fn(),
    onWithdraw: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("navigates across row action buttons with ArrowRight and ArrowLeft", () => {
    render(<TradeListItem {...baseProps} />);

    const copyBtn = screen.getByLabelText(/Copy link to trade TRD-9988/i);
    const viewBtn = screen.getByLabelText(/View trade TRD-9988/i);
    const depositBtn = screen.getByLabelText(/Deposit for trade TRD-9988/i);
    const withdrawBtn = screen.getByLabelText(/Withdraw for trade TRD-9988/i);

    copyBtn.focus();
    expect(document.activeElement).toBe(copyBtn);

    // ArrowRight to View
    fireEvent.keyDown(copyBtn, { key: "ArrowRight" });
    expect(document.activeElement).toBe(viewBtn);

    // ArrowRight to Deposit
    fireEvent.keyDown(viewBtn, { key: "ArrowRight" });
    expect(document.activeElement).toBe(depositBtn);

    // ArrowRight to Withdraw
    fireEvent.keyDown(depositBtn, { key: "ArrowRight" });
    expect(document.activeElement).toBe(withdrawBtn);

    // ArrowLeft back to Deposit
    fireEvent.keyDown(withdrawBtn, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(depositBtn);
  });

  it("triggers actions with Enter and Space keys on action buttons without triggering card view", () => {
    render(<TradeListItem {...baseProps} />);

    const depositBtn = screen.getByLabelText(/Deposit for trade TRD-9988/i);

    fireEvent.keyDown(depositBtn, { key: "Enter" });
    expect(baseProps.onDeposit).toHaveBeenCalledTimes(1);
    expect(baseProps.onView).not.toHaveBeenCalled();

    fireEvent.keyDown(depositBtn, { key: " " });
    expect(baseProps.onDeposit).toHaveBeenCalledTimes(2);
    expect(baseProps.onView).not.toHaveBeenCalled();
  });

  it("returns focus to row card on Escape key", () => {
    const { container } = render(<TradeListItem {...baseProps} />);

    const copyBtn = screen.getByLabelText(/Copy link to trade TRD-9988/i);
    const rowCard = container.querySelector('[role="button"]') as HTMLElement;

    copyBtn.focus();
    fireEvent.keyDown(copyBtn, { key: "Escape" });

    expect(document.activeElement).toBe(rowCard);
  });

  it("restores focus when restoreFocusTrigger becomes true", () => {
    const { rerender } = render(<TradeListItem {...baseProps} restoreFocusTrigger={false} />);

    const depositBtn = screen.getByLabelText(/Deposit for trade TRD-9988/i);
    fireEvent.click(depositBtn);

    // Simulate dialog closing with restoreFocusTrigger=true
    rerender(<TradeListItem {...baseProps} restoreFocusTrigger={true} />);

    expect(document.activeElement).toBe(depositBtn);
  });
});
