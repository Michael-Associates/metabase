import { formatShare } from "./format";

describe("formatShare", () => {
  it("shows a ratio as a percentage with at most one decimal", () => {
    expect(formatShare(0.625)).toBe("62.5%");
    expect(formatShare(0.4213)).toBe("42.1%");
    expect(formatShare(1)).toBe("100%");
  });

  it("uses the given number separators", () => {
    expect(formatShare(0.625, { numberSeparators: ",." })).toBe("62,5%");
  });

  it("shows a tiny share as under the smallest one it can show", () => {
    expect(formatShare(0.0004)).toBe("<0.1%");
    expect(formatShare(0)).toBe("0%");
  });
});
