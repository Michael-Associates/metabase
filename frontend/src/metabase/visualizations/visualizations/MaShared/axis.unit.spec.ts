import { getAxisItem, getAxisKey, sortAxisItems } from "./axis";

const NO_SORTING = { isTemporal: false, sortsText: false };

describe("getAxisKey", () => {
  it("tells apart values that only differ by type", () => {
    expect(getAxisKey(1)).not.toBe(getAxisKey("1"));
    expect(getAxisKey(null)).not.toBe(getAxisKey("null"));
  });
});

describe("sortAxisItems", () => {
  it("sorts numbers ascending and puts empty values last", () => {
    const items = [3, null, 1, 2].map(getAxisItem);

    expect(sortAxisItems(items, NO_SORTING).map((item) => item.value)).toEqual([
      1,
      2,
      3,
      null,
    ]);
  });

  it("sorts dates chronologically when the column is a date", () => {
    const items = ["2026-03-01", "2025-12-01", "2026-01-01"].map(getAxisItem);

    expect(
      sortAxisItems(items, { isTemporal: true, sortsText: false }).map(
        (item) => item.value,
      ),
    ).toEqual(["2025-12-01", "2026-01-01", "2026-03-01"]);
  });

  it("sorts text alphabetically only when asked to", () => {
    const items = ["Zoe", "Ana"].map(getAxisItem);

    expect(
      sortAxisItems(items, { isTemporal: false, sortsText: true }).map(
        (item) => item.value,
      ),
    ).toEqual(["Ana", "Zoe"]);
    expect(sortAxisItems(items, NO_SORTING).map((item) => item.value)).toEqual([
      "Zoe",
      "Ana",
    ]);
  });

  it("keeps the given order when numbers and text are mixed", () => {
    const items = [2, "x", 1].map(getAxisItem);

    expect(
      sortAxisItems(items, { isTemporal: false, sortsText: true }),
    ).toEqual(items);
  });
});
