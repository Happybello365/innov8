import { renderHook } from "@testing-library/react";
import { useIsAdmin } from "../useIsAdmin";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockAddress: { value: string | null } = { value: null };

jest.mock("../useFreighterIdentity", () => ({
  useFreighterIdentity: () => ({ address: mockAddress.value }),
}));

jest.mock("@/lib/adminAccess", () => ({
  getAdminAddresses: jest.fn(),
  isAdminAddress: jest.fn(),
}));

import { getAdminAddresses, isAdminAddress } from "@/lib/adminAccess";

const mockedGetAdminAddresses = getAdminAddresses as jest.MockedFunction<typeof getAdminAddresses>;
const mockedIsAdminAddress = isAdminAddress as jest.MockedFunction<typeof isAdminAddress>;

const ADMIN_WALLET = "GADMIN000000000000000000000000000000000000000000000000";
const USER_WALLET = "GUSER0000000000000000000000000000000000000000000000000";

beforeEach(() => {
  jest.clearAllMocks();
  mockAddress.value = null;
  mockedGetAdminAddresses.mockReturnValue([ADMIN_WALLET]);
  // Default: delegate to the real logic
  mockedIsAdminAddress.mockImplementation(
    (addr, admins) => Boolean(addr && admins.includes(addr))
  );
});

// ── Admin wallet ──────────────────────────────────────────────────────────────

describe("admin wallet connected", () => {
  it("returns true when the connected address is in the admin allowlist", () => {
    mockAddress.value = ADMIN_WALLET;
    mockedIsAdminAddress.mockReturnValue(true);

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(true);
    expect(mockedIsAdminAddress).toHaveBeenCalledWith(ADMIN_WALLET, [ADMIN_WALLET]);
  });
});

// ── Non-admin wallet ──────────────────────────────────────────────────────────

describe("non-admin wallet connected", () => {
  it("returns false when the connected address is not in the admin allowlist", () => {
    mockAddress.value = USER_WALLET;
    mockedIsAdminAddress.mockReturnValue(false);

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(false);
  });
});

// ── Wallet not yet loaded ─────────────────────────────────────────────────────

describe("wallet not yet loaded (address is null)", () => {
  it("returns false when address is null", () => {
    mockAddress.value = null;
    mockedIsAdminAddress.mockReturnValue(false);

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(false);
    expect(mockedIsAdminAddress).toHaveBeenCalledWith(null, expect.any(Array));
  });
});

// ── Empty admin list ──────────────────────────────────────────────────────────

describe("empty admin allowlist", () => {
  it("returns false even for a connected wallet when the allowlist is empty", () => {
    mockAddress.value = ADMIN_WALLET;
    mockedGetAdminAddresses.mockReturnValue([]);
    mockedIsAdminAddress.mockReturnValue(false);

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(false);
  });
});

// ── Multiple admins ───────────────────────────────────────────────────────────

describe("multiple admin addresses in allowlist", () => {
  const ADMIN_2 = "GADMIN222222222222222222222222222222222222222222222222";

  it("returns true for any address in the allowlist", () => {
    mockAddress.value = ADMIN_2;
    mockedGetAdminAddresses.mockReturnValue([ADMIN_WALLET, ADMIN_2]);
    mockedIsAdminAddress.mockReturnValue(true);

    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(true);
    expect(mockedIsAdminAddress).toHaveBeenCalledWith(ADMIN_2, [ADMIN_WALLET, ADMIN_2]);
  });
});

// ── getAdminAddresses throws ──────────────────────────────────────────────────

describe("auth check error — getAdminAddresses throws", () => {
  it("surfaces the error (hook does not swallow it)", () => {
    mockAddress.value = ADMIN_WALLET;
    mockedGetAdminAddresses.mockImplementation(() => {
      throw new Error("env misconfigured");
    });

    expect(() => renderHook(() => useIsAdmin())).toThrow("env misconfigured");
  });
});
