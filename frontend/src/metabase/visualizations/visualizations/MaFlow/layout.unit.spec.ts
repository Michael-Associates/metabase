import type { DatasetColumn, RowValues } from "metabase-types/api";
import {
  createMockColumn,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

import { getAxisKey } from "../MaShared/axis";

import {
  FLOW_TITLE_LETTER_SPACING,
  type FlowLayout,
  type FlowLayoutOptions,
  type FlowNodeText,
  getFlowLayout,
} from "./layout";
import { getFlowColumns, getFlowModel, getNodeKey } from "./model";

const CHARACTER_WIDTH = 7;
const FONT_SIZE = 12;
const measureText = (text: string) => text.length * CHARACTER_WIDTH;
const measureTitle = (text: string) =>
  text.length * (CHARACTER_WIDTH + FLOW_TITLE_LETTER_SPACING * FONT_SIZE);

const textColumn = (name: string) =>
  createMockColumn({
    name,
    display_name: name,
    base_type: "type/Text",
    effective_type: "type/Text",
    source: "breakout",
  });

const STEP_NAMES = ["lead_type", "booking", "outcome"];
const COUNT = createMockNumericColumn({ name: "count", source: "aggregation" });

const ROWS: RowValues[] = [
  ["Form", "Self", "Won", 10],
  ["Form", "Self", "Lost", 5],
  ["Form", "Screening", "Won", 4],
  ["Form", null, null, 6],
  ["Call", "Screening", "Won", 8],
  ["Call", "Screening", null, 2],
  ["Call", null, null, 5],
];

const nodeKey = (stepIndex: number, value: string) =>
  getNodeKey(stepIndex, getAxisKey(value));

interface SetupOpts extends Partial<FlowLayoutOptions> {
  rows?: RowValues[];
  stepNames?: string[];
}

const setup = ({
  rows = ROWS,
  stepNames = STEP_NAMES,
  ...options
}: SetupOpts = {}) => {
  const cols: DatasetColumn[] = [...stepNames.map(textColumn), COUNT];
  const columns = getFlowColumns(cols, {
    steps: stepNames,
    value: "count",
    colorBy: stepNames[0],
  });
  if (columns == null) {
    throw new Error("Expected the flow columns to resolve");
  }
  const model = getFlowModel(rows, columns, { nodeOrder: "size" });
  const nodeTexts = new Map<string, FlowNodeText>(
    Array.from(model.nodesByKey.values()).map((node) => [
      node.key,
      { name: String(node.value), detail: `${node.total} people` },
    ]),
  );
  return getFlowLayout({
    width: 900,
    height: 500,
    model,
    stepTitles: ["Lead type", "Booking", "Outcome"],
    nodeTexts,
    colorOrder: model.colors.map((color) => color.key),
    fontSize: FONT_SIZE,
    measureText,
    measureBoldText: measureText,
    ...options,
  });
};

const expectEveryBoxInside = (
  layout: FlowLayout,
  width: number,
  height: number,
) => {
  for (const rect of layout.nodes.values()) {
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width + 0.001);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(height + 0.001);
  }
};

describe("getFlowLayout", () => {
  it("keeps every box inside the space", () => {
    expectEveryBoxInside(setup(), 900, 500);
  });

  it("keeps every box inside the space when a step has a long tail of tiny values", () => {
    const rows: RowValues[] = [
      ["Form", "Big", "Won", 1000],
      ...Array.from(
        { length: 49 },
        (_, index): RowValues => ["Form", `Small ${index}`, "Won", 1],
      ),
    ];

    expectEveryBoxInside(setup({ rows, height: 300 }), 900, 300);
    expectEveryBoxInside(setup({ rows, height: 500 }), 900, 500);
  });

  it("keeps a fair share of the space for the largest box when a step has a long tail of tiny values", () => {
    const rows: RowValues[] = [
      ["Form", "Big", "Won", 1000],
      ...Array.from(
        { length: 49 },
        (_, index): RowValues => ["Form", `Small ${index}`, "Won", 1],
      ),
    ];

    for (const height of [300, 500]) {
      const big = setup({ rows, height }).nodes.get(nodeKey(1, "Big"));
      expect(big?.height ?? 0).toBeGreaterThan(height * 0.4);
    }
  });

  it("keeps every box inside the space when a step has more values than fit at the minimum height", () => {
    const rows = Array.from(
      { length: 300 },
      (_, index): RowValues => ["Form", `Booking ${index}`, "Won", index + 1],
    );

    expectEveryBoxInside(setup({ rows, height: 150 }), 900, 150);
  });

  it("sizes boxes on one scale, so equal totals get equal heights", () => {
    const layout = setup();
    const form = layout.nodes.get(nodeKey(0, "Form"));
    const self = layout.nodes.get(nodeKey(1, "Self"));
    const call = layout.nodes.get(nodeKey(0, "Call"));

    expect(form?.height).toBeCloseTo(25 * layout.scale);
    expect(call?.height).toBeCloseTo(15 * layout.scale);
    expect(self?.height).toBeCloseTo(call?.height ?? 0);
  });

  it("places the steps left to right", () => {
    const layout = setup();
    const xs = ["Form", "Self", "Won"].map(
      (value, stepIndex) => layout.nodes.get(nodeKey(stepIndex, value))?.x ?? 0,
    );

    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });

  it("keeps the steps apart in a narrow chart with many steps", () => {
    const stepNames = Array.from({ length: 8 }, (_, index) => `step_${index}`);
    const layout = setup({
      stepNames,
      rows: [[...stepNames.map((_, index) => `Value ${index}`), 10]],
      stepTitles: stepNames,
      width: 200,
    });
    const rects = stepNames.map((_, index) =>
      layout.nodes.get(nodeKey(index, `Value ${index}`)),
    );

    rects.slice(1).forEach((rect, index) => {
      const previous = rects[index];
      expect(previous).toBeDefined();
      expect(rect).toBeDefined();
      expect((previous?.x ?? 0) + (previous?.width ?? 0)).toBeLessThan(
        rect?.x ?? 0,
      );
    });
  });

  it("stacks each box's bands inside the box", () => {
    const layout = setup();
    const form = layout.nodes.get(nodeKey(0, "Form"));
    if (form == null) {
      throw new Error("Expected the Form box to be placed");
    }
    const formBands = Array.from(layout.bands.values()).filter(
      (band) =>
        band.sourceX === form.x + form.width &&
        band.sourceY >= form.y &&
        band.sourceY < form.y + form.height,
    );
    const bandsBottom = Math.max(
      ...formBands.map((band) => band.sourceY + band.width),
    );

    expect(formBands).toHaveLength(2);
    expect(bandsBottom).toBeLessThanOrEqual(form.y + form.height + 0.001);
  });

  it("puts first-step labels on the left and the others on the right", () => {
    const layout = setup();
    const formLabel = layout.labels.get(nodeKey(0, "Form"));
    const wonLabel = layout.labels.get(nodeKey(2, "Won"));

    expect(formLabel?.anchor).toBe("end");
    expect(wonLabel?.anchor).toBe("start");
    expect(formLabel?.detail).toBe("25 people");
  });

  it("leaves labels out when the boxes are too small for them", () => {
    const layout = setup({ height: 60 });

    expect(layout.labels.size).toBeLessThan(6);
  });

  it("titles each step above its boxes in uppercase", () => {
    const layout = setup();

    expect(layout.stepTitles.map((title) => title.text)).toEqual([
      "LEAD TYPE",
      "BOOKING",
      "OUTCOME",
    ]);
    expect(layout.stepTitles[0].anchor).toBe("end");
    expect(layout.stepTitles[2].anchor).toBe("start");
  });

  it("shortens a step title, as drawn with its letter spacing, before it runs into the next step", () => {
    const layout = setup({
      stepTitles: ["Lead type", "Booking channel of the person", "Outcome"],
      width: 420,
    });
    const [, middle, last] = layout.stepTitles;

    expect(middle.text.endsWith("…")).toBe(true);
    expect(middle.x + measureTitle(middle.text)).toBeLessThanOrEqual(last.x);
    expect(last.x + measureTitle(last.text)).toBeLessThanOrEqual(420);
  });
});
