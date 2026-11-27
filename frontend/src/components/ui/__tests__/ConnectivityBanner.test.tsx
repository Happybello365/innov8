import { render, screen, act } from "@testing-library/react";
import { ConnectivityBanner } from "../ConnectivityBanner";
import { useOfflineQueueStore, type QueuedAction } from "@/stores/offlineQueueStore";
import { useOffline } from "@/hooks/useOffline";

jest.mock("@/hooks/useOffline", () => ({
  useOffline: jest.fn(),
}));

jest.mock("@/hooks/useToast", () => ({
  useToast: () => ({ addToast: jest.fn(), addToastWithCorrelation: jest.fn() }),
}));

jest.mock("@/lib/api/client", () => ({
  request: jest.fn(),
}));

const mockUseOffline = useOffline as jest.Mock;

function queued(id: string, type: QueuedAction["type"]): QueuedAction {
  return {
    id,
    type,
    endpoint: "/x",
    method: "POST",
    idempotencyKey: `k-${id}`,
    correlationId: `c-${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    attempts: 0,
  };
}

function setOffline(isOffline: boolean) {
  mockUseOffline.mockReturnValue({
    isOffline,
    wasOffline: isOffline,
    isOnline: !isOffline,
    retryOnline: jest.fn(),
  });
}

describe("ConnectivityBanner – queued action summary (#500)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      useOfflineQueueStore.setState({ queue: [], isOnline: true });
    });
  });

  it("shows queued counts by type while offline, without claiming submission", () => {
    setOffline(true);
    act(() => {
      useOfflineQueueStore.setState({
        queue: [queued("a", "deposit"), queued("b", "deposit"), queued("c", "release")],
      });
    });

    render(<ConnectivityBanner />);

    expect(screen.getByText("3 actions queued")).toBeInTheDocument();
    expect(screen.getByText(/2 deposits, 1 release\. Not submitted yet\./)).toBeInTheDocument();
    expect(screen.getByText(/actions will be queued and sent when reconnected/)).toBeInTheDocument();
  });

  it("uses singular wording for one queued action", () => {
    setOffline(true);
    act(() => {
      useOfflineQueueStore.setState({ queue: [queued("a", "dispute")] });
    });

    render(<ConnectivityBanner />);

    expect(screen.getByText("1 action queued")).toBeInTheDocument();
    expect(screen.getByText(/1 dispute\. Not submitted yet\./)).toBeInTheDocument();
  });

  it("omits the summary when nothing is queued", () => {
    setOffline(true);

    render(<ConnectivityBanner />);

    expect(screen.queryByTestId("queued-actions-summary")).not.toBeInTheDocument();
    expect(screen.queryByText(/Not submitted yet/)).toBeNull();
    expect(screen.queryByText(/actions? queued$/)).toBeNull();
  });

  it("does not render the summary when online with an empty queue", () => {
    setOffline(false);

    const { container } = render(<ConnectivityBanner />);

    expect(container).toBeEmptyDOMElement();
  });
});
