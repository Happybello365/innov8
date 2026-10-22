/**
 * Tests for URL query string persistence of audit page filter state (#225).
 */
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import AdminAuditHistoryPage from "../page";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { api } from "@/lib/api";
import { trackAdminEvent } from "@/lib/analytics";

jest.mock("@/hooks/useAuth");
jest.mock("@/hooks/useIsAdmin");
jest.mock("@/lib/analytics", () => ({ trackAdminEvent: jest.fn() }));

let mockSearchParams = new URLSearchParams();
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/admin/audit",
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/lib/api", () => ({
  api: { adminAudit: { list: jest.fn() } },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(s: number, m: string) { super(m); this.status = s; }
  },
}));
jest.mock("@/lib/breadcrumbs", () => ({ generateBreadcrumbs: () => [] }));
jest.mock("@/components/ui/Breadcrumbs", () => ({ Breadcrumbs: () => null }));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseIsAdmin = useIsAdmin as jest.MockedFunction<typeof useIsAdmin>;
const mockList = api.adminAudit.list as jest.MockedFunction<typeof api.adminAudit.list>;

function makeEntry(overrides = {}) {
  return {
    id: 1, action: "TREASURY_WITHDRAW", actorAddress: "GADMIN", targetReference: null, note: null,
    createdAt: "2026-07-05T12:00:00.000Z", ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  mockUseAuth.mockReturnValue({ token: "tok", isAuthenticated: true } as ReturnType<typeof useAuth>);
  mockUseIsAdmin.mockReturnValue(true);
});

describe("AdminAuditHistoryPage — URL persistence (#225)", () => {
  it("reads initial page from URL query param", async () => {
    mockSearchParams = new URLSearchParams("page=3");
    mockList.mockResolvedValue({
      items: [makeEntry()],
      pagination: { page: 3, limit: 20, total: 60, totalPages: 3 },
    });

    render(<AdminAuditHistoryPage />);

    await waitFor(() => expect(mockList).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ page: 3 })));
  });

  it("treats an invalid page param as page 1", async () => {
    mockSearchParams = new URLSearchParams("page=banana");
    mockList.mockResolvedValue({
      items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    });

    render(<AdminAuditHistoryPage />);

    await waitFor(() => expect(mockList).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ page: 1 })));
  });

  it("updates the URL when navigating to next page", async () => {
    mockList.mockResolvedValue({
      items: [makeEntry()],
      pagination: { page: 1, limit: 20, total: 40, totalPages: 2 },
    });

    render(<AdminAuditHistoryPage />);

    await waitFor(() => screen.getByText("Next"));
    fireEvent.click(screen.getByText("Next"));

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining("page=2"),
        expect.anything(),
      ),
    );
  });
});
