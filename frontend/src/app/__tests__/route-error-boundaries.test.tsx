import { render, screen } from "@testing-library/react";
import { reportBoundaryError } from "@/lib/errorReporter";
import VaultError from "../vault/error";
import StreamsError from "../streams/error";
import ReputationError from "../reputation/error";
import SettingsError from "../settings/error";
import AssetsError from "../assets/error";
import HelpError from "../help/error";
import AdminError from "../admin/error";
import MediatorError from "../mediator/error";

jest.mock("@/lib/errorReporter", () => ({
  reportBoundaryError: jest.fn(),
}));

const mockReport = reportBoundaryError as jest.Mock;

type Boundary = React.ComponentType<{ error: Error & { digest?: string }; reset: () => void }>;

const cases: Array<{ name: string; Component: Boundary; segment: string; backHref: string }> = [
  { name: "vault", Component: VaultError, segment: "vault", backHref: "/vault" },
  { name: "streams", Component: StreamsError, segment: "streams", backHref: "/streams" },
  { name: "reputation", Component: ReputationError, segment: "reputation", backHref: "/reputation" },
  { name: "settings", Component: SettingsError, segment: "settings", backHref: "/settings" },
  { name: "assets", Component: AssetsError, segment: "assets", backHref: "/assets" },
  { name: "help", Component: HelpError, segment: "help", backHref: "/help" },
  { name: "admin", Component: AdminError, segment: "admin", backHref: "/dashboard" },
  { name: "mediator", Component: MediatorError, segment: "mediator", backHref: "/dashboard" },
];

describe.each(cases)("$name route error boundary", ({ Component, segment, backHref }) => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the fallback, reports under its segment, and wires recovery", () => {
    const reset = jest.fn();
    const error = Object.assign(new Error("render failed"), { digest: `d-${segment}` });

    render(<Component error={error} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByTestId("back-to-dashboard")).toHaveAttribute("href", backHref);

    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith(
      expect.objectContaining({ meta: { segment, digest: `d-${segment}` } }),
    );

    screen.getByTestId("retry-button").click();
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
