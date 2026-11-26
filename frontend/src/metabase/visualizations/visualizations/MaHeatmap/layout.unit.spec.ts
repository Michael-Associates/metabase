import {
  type HeatmapLayoutOptions,
  getHeatmapLayout,
  truncateLabel,
} from "./layout";

const CHARACTER_WIDTH = 7;
const measureText = (text: string) => text.length * CHARACTER_WIDTH;

const range = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, index) => `${prefix}${index}`);

const setup = (options: Partial<HeatmapLayoutOptions> = {}) =>
  getHeatmapLayout({
    width: 800,
    height: 400,
    rowLabels: ["Monday", "Tuesday", "Wednesday"],
    columnLabels: ["9", "10", "11"],
    fontSize: 12,
    measureText,
    ...options,
  });

describe("getHeatmapLayout", () => {
  it("keeps the grid inside the available space", () => {
    const layout = setup();

    expect(layout.plotX + layout.plotWidth).toBeLessThanOrEqual(800);
    expect(layout.plotY + layout.plotHeight).toBeLessThanOrEqual(400);
    expect(layout.cellWidth * 3).toBeCloseTo(layout.plotWidth);
    expect(layout.cellHeight * 3).toBeCloseTo(layout.plotHeight);
  });

  it("leaves room on the left for the widest row label", () => {
    const layout = setup();

    expect(layout.plotX).toBeGreaterThan(measureText("Wednesday"));
    expect(layout.rowLabels).toEqual(["Monday", "Tuesday", "Wednesday"]);
  });

  it("shortens row labels that would take more than a third of the width", () => {
    const longLabel = "A very long attorney name that keeps going";
    const layout = setup({ width: 300, rowLabels: [longLabel] });

    expect(layout.rowLabels[0]).toMatch(/…$/);
    expect(measureText(layout.rowLabels[0])).toBeLessThanOrEqual(300 * 0.3);
  });

  it("keeps column labels level when they fit their cells", () => {
    const layout = setup();

    expect(layout.areColumnLabelsRotated).toBe(false);
    expect(layout.columnLabelStep).toBe(1);
  });

  it("turns column labels when they are wider than their cells", () => {
    const layout = setup({
      columnLabels: range(24, "September 2026 week "),
    });

    expect(layout.areColumnLabelsRotated).toBe(true);
  });

  it("moves the grid right so the first turned column label is not cut off", () => {
    const layout = setup({
      rowLabels: ["Mon", "Tue"],
      columnLabels: range(24, "September 2026 week "),
    });
    const widestLabel = Math.max(
      ...layout.columnLabels.map((label) => measureText(label)),
    );
    const firstLabelLeftEdge =
      layout.plotX + layout.cellWidth / 2 - widestLabel * Math.SQRT1_2;

    expect(firstLabelLeftEdge).toBeGreaterThanOrEqual(0);
    expect(layout.plotX + layout.plotWidth).toBeLessThanOrEqual(800);
  });

  it("shows every n-th label when there are too many to show them all", () => {
    const layout = setup({
      height: 200,
      rowLabels: range(60, "Row "),
      columnLabels: range(200, "Column "),
    });

    expect(layout.rowLabelStep).toBeGreaterThan(1);
    expect(layout.columnLabelStep).toBeGreaterThan(1);
  });

  it("drops the gap between cells when cells are tiny", () => {
    const layout = setup({ columnLabels: range(400, "") });

    expect(layout.cellGap).toBe(0);
  });

  it("never returns negative sizes when there is no room", () => {
    const layout = setup({ width: 10, height: 10 });

    expect(layout.plotWidth).toBeGreaterThanOrEqual(0);
    expect(layout.plotHeight).toBeGreaterThanOrEqual(0);
  });
});

describe("truncateLabel", () => {
  it("returns the label unchanged when it fits", () => {
    expect(truncateLabel("Dallas", 100, measureText)).toBe("Dallas");
  });

  it("keeps as much of the label as fits, followed by an ellipsis", () => {
    const label = truncateLabel("Fort Worth", 5 * CHARACTER_WIDTH, measureText);

    expect(label).toBe("Fort…");
  });

  it("returns an empty label when not even one character fits", () => {
    expect(truncateLabel("Austin", 1, measureText)).toBe("");
  });
});
