import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import SettingsPage from "../page";

// ── Mock useAuth ──────────────────────────────────────────────────────────────

jest.mock("@/hooks/useAuth", () => ({
  useAuth: jest.fn(),
}));

import { useAuth } from "@/hooks/useAuth";
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

const mockAuthBase = {
  address: "GABCDEFGHIJKLMNOPXYZ",
  token: "test-token",
  isAuthenticated: true,
  isWalletConnected: true,
  isWalletDetected: true,
  isLoading: false,
  connectWallet: jest.fn(),
  authenticate: jest.fn(),
  logout: jest.fn(),
};

// ── Mock API client ───────────────────────────────────────────────────────────

jest.mock("@/lib/api/client", () => ({
  request: jest.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { request } from "@/lib/api/client";
const mockedRequest = request as jest.MockedFunction<typeof request>;

// ── Mock webhooks API (needed by WebhookSection) ──────────────────────────────

jest.mock("@/lib/api/webhooks", () => ({
  webhooksApi: {
    list: jest.fn().mockResolvedValue({ webhooks: [] }),
    create: jest.fn(),
    remove: jest.fn(),
  },
  AVAILABLE_EVENTS: ["trade.created", "trade.completed"],
}));

// ── Mock UI components not under test ─────────────────────────────────────────

jest.mock("@/components/ui/ConfirmActionModal", () => ({
  ConfirmActionModal: ({ open, onConfirm }: any) =>
    open ? (
      <div data-testid="confirm-modal">
        <button onClick={onConfirm}>Confirm</button>
      </div>
    ) : null,
}));

jest.mock("@/components/ui/Spinner", () => ({
  Spinner: () => <div data-testid="spinner" />,
}));

jest.mock("@/components/ui/EmptyState", () => ({
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      <p>{description}</p>
    </div>
  ),
}));

jest.mock("@/components/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Settings – Quiet Hours section", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue(mockAuthBase as any);
    mockedRequest.mockResolvedValue({ preferences: {} });
  });

  test("renders the 'Enable quiet hours' toggle", async () => {
    await act(async () => {
      render(<SettingsPage />);
    });

    expect(
      screen.getByRole("switch", { name: /enable quiet hours/i }),
    ).toBeInTheDocument();
  });

  test("quiet hours time inputs are hidden when toggle is off", async () => {
    await act(async () => {
      render(<SettingsPage />);
    });

    expect(
      screen.queryByLabelText(/quiet hours start time/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/quiet hours end time/i),
    ).not.toBeInTheDocument();
  });

  test("reveals time inputs and timezone when quiet hours are enabled", async () => {
    await act(async () => {
      render(<SettingsPage />);
    });

    const toggle = screen.getByRole("switch", { name: /enable quiet hours/i });

    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(
      screen.getByLabelText(/quiet hours start time/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/quiet hours end time/i),
    ).toBeInTheDocument();
  });

  test("displays the user's local timezone when quiet hours are enabled", async () => {
    await act(async () => {
      render(<SettingsPage />);
    });

    const toggle = screen.getByRole("switch", { name: /enable quiet hours/i });
    await act(async () => {
      fireEvent.click(toggle);
    });

    const timezoneLabel = screen.getByTestId("quiet-hours-timezone-label");
    expect(timezoneLabel).toBeInTheDocument();
    // The timezone string is non-empty (e.g. "UTC" or "America/New_York")
    expect(timezoneLabel.textContent).toBeTruthy();
  });

  test("calls PUT /notifications/preferences when 'Save quiet hours' is clicked", async () => {
    await act(async () => {
      render(<SettingsPage />);
    });

    // Enable quiet hours to reveal the save button
    const toggle = screen.getByRole("switch", { name: /enable quiet hours/i });
    await act(async () => {
      fireEvent.click(toggle);
    });

    const saveButton = screen.getByRole("button", { name: /save quiet hours/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(mockedRequest).toHaveBeenCalledWith(
        "/notifications/preferences",
        expect.objectContaining({
          method: "PUT",
          token: "test-token",
        }),
      );
    });
  });

  test("shows success feedback after a successful save", async () => {
    mockedRequest.mockResolvedValue({ preferences: {} });

    await act(async () => {
      render(<SettingsPage />);
    });

    const toggle = screen.getByRole("switch", { name: /enable quiet hours/i });
    await act(async () => {
      fireEvent.click(toggle);
    });

    const saveButton = screen.getByRole("button", { name: /save quiet hours/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/saved/i)).toBeInTheDocument();
    });
  });

  test("shows error message when the API call fails", async () => {
    mockedRequest.mockRejectedValue(new Error("Network error"));

    await act(async () => {
      render(<SettingsPage />);
    });

    const toggle = screen.getByRole("switch", { name: /enable quiet hours/i });
    await act(async () => {
      fireEvent.click(toggle);
    });

    const saveButton = screen.getByRole("button", { name: /save quiet hours/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });
});
