/**
 * Tests for the centralized pagination metadata helper (issue #449).
 */
import {
  buildPaginationMeta,
  parsePaginationParams,
  UnsupportedCursorError,
  InvalidPaginationParamsError,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MIN_LIMIT,
} from "../lib/paginationMeta";

describe("buildPaginationMeta", () => {
  it("returns correct metadata for a mid-set page", () => {
    const meta = buildPaginationMeta(2, 10, 55);
    expect(meta).toEqual({ page: 2, limit: 10, total: 55, totalPages: 6 });
  });

  it("sets totalPages to 1 when total is 0 (empty result set)", () => {
    const meta = buildPaginationMeta(1, 20, 0);
    expect(meta.totalPages).toBe(1);
    expect(meta.total).toBe(0);
  });

  it("rounds totalPages up for a partial last page", () => {
    // 21 items / 10 per page = 2.1 → ceil = 3
    expect(buildPaginationMeta(1, 10, 21).totalPages).toBe(3);
  });

  it("sets totalPages to 1 when total equals limit exactly", () => {
    expect(buildPaginationMeta(1, 20, 20).totalPages).toBe(1);
  });

  it("includes all four required fields", () => {
    const meta = buildPaginationMeta(3, 5, 100);
    expect(Object.keys(meta).sort()).toEqual(["limit", "page", "total", "totalPages"]);
  });
});

describe("parsePaginationParams", () => {
  describe("defaults", () => {
    it("returns default page and limit when query is empty", () => {
      const params = parsePaginationParams({});
      expect(params.page).toBe(DEFAULT_PAGE);
      expect(params.limit).toBe(DEFAULT_LIMIT);
      expect(params.skip).toBe(0);
    });

    it("computes skip from page and limit", () => {
      const params = parsePaginationParams({ page: "3", limit: "10" });
      expect(params.skip).toBe(20);
    });
  });

  describe("valid inputs", () => {
    it("accepts string-encoded integers (Express query shape)", () => {
      const params = parsePaginationParams({ page: "2", limit: "15" });
      expect(params.page).toBe(2);
      expect(params.limit).toBe(15);
    });

    it("accepts numeric inputs directly", () => {
      const params = parsePaginationParams({ page: 4, limit: 25 });
      expect(params.page).toBe(4);
      expect(params.limit).toBe(25);
    });

    it("clamps limit to MAX_LIMIT", () => {
      const params = parsePaginationParams({ limit: String(MAX_LIMIT + 500) });
      expect(params.limit).toBe(MAX_LIMIT);
    });

    it("clamps limit to MIN_LIMIT from below", () => {
      // 0 would throw; here we test that MIN_LIMIT=1 is enforced at the
      // coercion boundary — a value of 1 must be accepted.
      const params = parsePaginationParams({ limit: "1" });
      expect(params.limit).toBe(MIN_LIMIT);
    });
  });

  describe("invalid inputs", () => {
    it("throws InvalidPaginationParamsError for page=0", () => {
      expect(() => parsePaginationParams({ page: "0" })).toThrow(
        InvalidPaginationParamsError,
      );
    });

    it("throws InvalidPaginationParamsError for negative page", () => {
      expect(() => parsePaginationParams({ page: "-1" })).toThrow(
        InvalidPaginationParamsError,
      );
    });

    it("throws InvalidPaginationParamsError for page=abc", () => {
      expect(() => parsePaginationParams({ page: "abc" })).toThrow(
        InvalidPaginationParamsError,
      );
    });

    it("throws InvalidPaginationParamsError for limit=0", () => {
      expect(() => parsePaginationParams({ limit: "0" })).toThrow(
        InvalidPaginationParamsError,
      );
    });

    it("throws InvalidPaginationParamsError for fractional page", () => {
      expect(() => parsePaginationParams({ page: "1.5" })).toThrow(
        InvalidPaginationParamsError,
      );
    });

    it("InvalidPaginationParamsError carries status 400", () => {
      let err: unknown;
      try {
        parsePaginationParams({ page: "0" });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(InvalidPaginationParamsError);
      expect((err as InvalidPaginationParamsError).status).toBe(400);
    });
  });

  describe("cursor rejection", () => {
    it("throws UnsupportedCursorError when cursor is provided", () => {
      expect(() =>
        parsePaginationParams({ cursor: "someOpaqueToken", page: "1" }),
      ).toThrow(UnsupportedCursorError);
    });

    it("does not throw for cursor=undefined", () => {
      expect(() =>
        parsePaginationParams({ cursor: undefined }),
      ).not.toThrow();
    });

    it("does not throw for cursor=empty string", () => {
      expect(() =>
        parsePaginationParams({ cursor: "" }),
      ).not.toThrow();
    });

    it("UnsupportedCursorError carries status 400", () => {
      let err: unknown;
      try {
        parsePaginationParams({ cursor: "tok" });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(UnsupportedCursorError);
      expect((err as UnsupportedCursorError).status).toBe(400);
    });

    it("UnsupportedCursorError message mentions cursor and page/limit", () => {
      let err: unknown;
      try {
        parsePaginationParams({ cursor: "tok" });
      } catch (e) {
        err = e;
      }
      expect((err as Error).message).toMatch(/cursor/i);
      expect((err as Error).message).toMatch(/page/i);
    });
  });
});
