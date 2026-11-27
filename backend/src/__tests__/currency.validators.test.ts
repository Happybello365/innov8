import {
  normalizeCurrencyCode,
  normalizeCurrencyFields,
  currencyCodeSchema,
  CURRENCY_FIELD_NAMES,
} from "../validators/currency.validators";

describe("currency.validators", () => {
  describe("normalizeCurrencyCode", () => {
    it("converts mixed-case currency codes to uppercase", () => {
      expect(normalizeCurrencyCode("ngn")).toBe("NGN");
      expect(normalizeCurrencyCode("Ngn")).toBe("NGN");
      expect(normalizeCurrencyCode("nGn")).toBe("NGN");
      expect(normalizeCurrencyCode("NGN")).toBe("NGN");
      expect(normalizeCurrencyCode("  ngn  ")).toBe("NGN");
      expect(normalizeCurrencyCode("cngn")).toBe("CNGN");
      expect(normalizeCurrencyCode("usdc")).toBe("USDC");
    });

    it("returns non-string values unchanged", () => {
      expect(normalizeCurrencyCode(123)).toBe(123);
      expect(normalizeCurrencyCode(null)).toBeNull();
      expect(normalizeCurrencyCode(undefined)).toBeUndefined();
    });
  });

  describe("normalizeCurrencyFields", () => {
    it("uppercases currency fields in a flat object", () => {
      const input = {
        currency: "ngn",
        asset: "cngn",
        amount: "100",
        other: "leaveMeAlone",
      };
      const result = normalizeCurrencyFields(input);
      expect(result).toEqual({
        currency: "NGN",
        asset: "CNGN",
        amount: "100",
        other: "leaveMeAlone",
      });
    });

    it("uppercases currency fields in nested objects", () => {
      const input = {
        trade: {
          currency: "Ngn",
          details: {
            sourceAsset: "xlm",
            destinationAsset: "usdc",
          },
        },
      };
      const result = normalizeCurrencyFields(input);
      expect(result).toEqual({
        trade: {
          currency: "NGN",
          details: {
            sourceAsset: "XLM",
            destinationAsset: "USDC",
          },
        },
      });
    });

    it("handles non-object inputs", () => {
      expect(normalizeCurrencyFields(null)).toBeNull();
      expect(normalizeCurrencyFields("string")).toBe("string");
      expect(normalizeCurrencyFields(123)).toBe(123);
    });
  });

  describe("currencyCodeSchema", () => {
    it("validates and transforms mixed-case currency inputs", () => {
      expect(currencyCodeSchema.parse("ngn")).toBe("NGN");
      expect(currencyCodeSchema.parse("Ngn")).toBe("NGN");
      expect(currencyCodeSchema.parse("NGN")).toBe("NGN");
      expect(currencyCodeSchema.parse("  usdc ")).toBe("USDC");
    });

    it("rejects empty string", () => {
      expect(() => currencyCodeSchema.parse("")).toThrow();
    });
  });
});
