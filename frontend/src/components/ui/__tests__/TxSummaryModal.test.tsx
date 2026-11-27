/**
 * Tests for TxSummaryModal, specifically the operation details toggle (#483).
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TxSummaryModal, type TxSummaryItem, type TxOperationDetail } from "../TxSummaryModal";

// Minimal Modal mock that renders children inline
jest.mock("../Modal", () => ({
  Modal: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="modal">{children}</div> : null,
  ModalContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="modal-content">{children}</div>
  ),
  ModalHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="modal-header">{children}</div>
  ),
  ModalTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="modal-title">{children}</h2>
  ),
  ModalDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="modal-description">{children}</p>
  ),
  ModalFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="modal-footer">{children}</div>
  ),
}));

jest.mock("../Button", () => ({
  Button: React.forwardRef(
    (
      { children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean },
      ref: React.Ref<HTMLButtonElement>,
    ) => (
      <button ref={ref} onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
  ),
}));

const baseItems: TxSummaryItem[] = [
  { label: "Action", value: "Deposit Funds" },
  { label: "Trade ID", value: "TRD-001" },
  { label: "Amount", value: "100 cNGN" },
];

const operationDetails: TxOperationDetail[] = [
  {
    type: "invokeHostFunction",
    fields: [
      { label: "Contract", value: "Amana Escrow (Soroban)" },
      { label: "Function", value: "deposit" },
      { label: "Amount", value: "100 cNGN" },
    ],
  },
];

describe("TxSummaryModal", () => {
  const defaultProps = {
    open: true,
    onOpenChange: jest.fn(),
    actionLabel: "Deposit Funds",
    items: baseItems,
    onConfirm: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders summary items", () => {
    render(<TxSummaryModal {...defaultProps} />);
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Deposit Funds")).toBeInTheDocument();
    expect(screen.getByText("TRD-001")).toBeInTheDocument();
  });

  it("does not show operation details toggle when no details provided", () => {
    render(<TxSummaryModal {...defaultProps} />);
    expect(screen.queryByTestId("tx-operation-details-toggle")).not.toBeInTheDocument();
  });

  it("shows operation details toggle when details are provided (#483)", () => {
    render(<TxSummaryModal {...defaultProps} operationDetails={operationDetails} />);
    expect(screen.getByTestId("tx-operation-details-toggle")).toBeInTheDocument();
  });

  it("hides the detail panel by default (#483)", () => {
    render(<TxSummaryModal {...defaultProps} operationDetails={operationDetails} />);
    expect(screen.queryByTestId("tx-operation-details-panel")).not.toBeInTheDocument();
  });

  it("expands detail panel on toggle click (#483)", () => {
    render(<TxSummaryModal {...defaultProps} operationDetails={operationDetails} />);
    fireEvent.click(screen.getByTestId("tx-operation-details-toggle"));
    expect(screen.getByTestId("tx-operation-details-panel")).toBeInTheDocument();
  });

  it("shows operation type and fields when expanded (#483)", () => {
    render(<TxSummaryModal {...defaultProps} operationDetails={operationDetails} />);
    fireEvent.click(screen.getByTestId("tx-operation-details-toggle"));

    expect(screen.getByText("invokeHostFunction")).toBeInTheDocument();
    expect(screen.getByText("deposit")).toBeInTheDocument();
    expect(screen.getByText("Amana Escrow (Soroban)")).toBeInTheDocument();
  });

  it("collapses panel on second toggle click (#483)", () => {
    render(<TxSummaryModal {...defaultProps} operationDetails={operationDetails} />);
    const toggle = screen.getByTestId("tx-operation-details-toggle");
    fireEvent.click(toggle); // expand
    expect(screen.getByTestId("tx-operation-details-panel")).toBeInTheDocument();
    fireEvent.click(toggle); // collapse
    expect(screen.queryByTestId("tx-operation-details-panel")).not.toBeInTheDocument();
  });

  it("toggle button has correct aria-expanded state", () => {
    render(<TxSummaryModal {...defaultProps} operationDetails={operationDetails} />);
    const toggle = screen.getByTestId("tx-operation-details-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("calls onConfirm when sign button is clicked", () => {
    const onConfirm = jest.fn();
    render(<TxSummaryModal {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId("tx-summary-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenChange(false) when cancel is clicked", () => {
    const onOpenChange = jest.fn();
    render(<TxSummaryModal {...defaultProps} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables confirm button when loading", () => {
    render(<TxSummaryModal {...defaultProps} loading={true} />);
    expect(screen.getByTestId("tx-summary-confirm")).toBeDisabled();
  });

  it("shows operation count in toggle label", () => {
    render(<TxSummaryModal {...defaultProps} operationDetails={operationDetails} />);
    expect(screen.getByText(/Operation details \(1 operation\)/)).toBeInTheDocument();
  });

  it("shows plural for multiple operations", () => {
    const twoOps = [
      ...operationDetails,
      { type: "payment", fields: [{ label: "To", value: "GC..." }] },
    ];
    render(<TxSummaryModal {...defaultProps} operationDetails={twoOps} />);
    expect(screen.getByText(/2 operations/)).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(<TxSummaryModal {...defaultProps} open={false} />);
    expect(screen.queryByTestId("modal")).not.toBeInTheDocument();
  });
});
