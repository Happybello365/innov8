import { render, screen, fireEvent } from "@testing-library/react";
import { RouteErrorBoundary } from "../RouteErrorBoundary";
import { reportBoundaryError } from "@/lib/errorReporter";

jest.mock("@/lib/errorReporter", () => ({
  reportBoundaryError: jest.fn(),
}));

const mockReport = reportBoundaryError as jest.Mock;

describe("RouteErrorBoundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the branded fallback with a correlation reference", () => {
    const error = Object.assign(new Error("boom"), { digest: "digest-abc" });
    render(
      <RouteErrorBoundary
        error={error}
        reset={jest.fn()}
        segment="vault"
        backHref="/vault"
        backLabel="Back to vault"
      />,
    );

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByTestId("correlation-id")).toHaveTextContent("digest-abc");
  });

  it("reports the error once with segment metadata", () => {
    const error = Object.assign(new Error("boom"), { digest: "digest-abc" });
    const { rerender } = render(
      <RouteErrorBoundary
        error={error}
        reset={jest.fn()}
        segment="vault"
        backHref="/vault"
        backLabel="Back to vault"
      />,
    );

    rerender(
      <RouteErrorBoundary
        error={error}
        reset={jest.fn()}
        segment="vault"
        backHref="/vault"
        backLabel="Back to vault"
      />,
    );

    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith(
      expect.objectContaining({
        error,
        correlationId: "digest-abc",
        componentStack: null,
        meta: { segment: "vault", digest: "digest-abc" },
      }),
    );
  });

  it("keeps the same correlation reference across re-renders", () => {
    const error = new Error("boom");
    const props = {
      error,
      reset: jest.fn(),
      segment: "vault",
      backHref: "/vault",
      backLabel: "Back to vault",
    };
    const { rerender } = render(<RouteErrorBoundary {...props} />);
    const first = screen.getByTestId("correlation-id").textContent;

    rerender(<RouteErrorBoundary {...props} />);

    expect(screen.getByTestId("correlation-id").textContent).toBe(first);
  });

  it("calls reset when the user clicks Try again", () => {
    const reset = jest.fn();
    render(
      <RouteErrorBoundary
        error={new Error("boom")}
        reset={reset}
        segment="vault"
        backHref="/vault"
        backLabel="Back to vault"
      />,
    );

    fireEvent.click(screen.getByTestId("retry-button"));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("links the back action to the supplied route", () => {
    render(
      <RouteErrorBoundary
        error={new Error("boom")}
        reset={jest.fn()}
        segment="help"
        backHref="/help"
        backLabel="Back to help"
      />,
    );

    const back = screen.getByTestId("back-to-dashboard");
    expect(back).toHaveAttribute("href", "/help");
    expect(back).toHaveTextContent("Back to help");
  });
});
