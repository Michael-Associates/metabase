import { formatShare } from "./format";

describe("formatShare", () => {
  it("shows a ratio as a percentage with at most one decimal", () => {
    expect(formatShare(0.625)).toBe("62.5%");
    expect(formatShare(0.4213)).toBe("42.1%");
    expect(formatShare(1)).toBe("100%");
  });
});
