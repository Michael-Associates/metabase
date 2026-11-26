import type { RowValues } from "metabase-types/api";
import {
  createMockColumn,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

import { getAxisKey } from "../MaShared/axis";

import {
  FLOW_NODE_WIDTH,
  type FlowLayoutOptions,
  type FlowNodeText,
  getFlowLayout,
} from "./layout";
import { getFlowColumns, getFlowModel, getNodeKey } from "./model";

const CHARACTER_WIDTH = 7;
const measureText = (text: string) => text.length * CHARACTER_WIDTH;

const textColumn = (name: string) =>
  createMockColumn({
    name,
    display_name: name,
    base_type: "type/Text",
    effective_type: "type/Text",
    source: "breakout",
  });

const COLS = [
  textColumn("lead_type"),
  textColumn("booking"),
  textColumn("outcome"),
  createMockNumericColumn({ name: "count", source: "aggregation" }),
];

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

const setup = (options: Partial<FlowLayoutOptions> = {}) => {
  const columns = getFlowColumns(COLS, {
    steps: ["lead_type", "booking", "outcome"],
    value: "count",
    colorBy: "lead_type",
  });
  if (columns == null) {
    throw new Error("Expected the flow columns to resolve");
  }
  const model = getFlowModel(ROWS, columns, { nodeOrder: "size" });
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
    fontSize: 12,
    measureText,
    measureBoldText: measureText,
    ...options,
  });
};

describe("getFlowLayout", () => {
  it("keeps every box inside the space", () => {
    const layout = setup();

    for (const rect of layout.nodes.values()) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(900);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.y + rect.height).toBeLessThanOrEqual(500);
    }
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

  it("stacks each box's bands inside the box", () => {
    const layout = setup();
    const form = layout.nodes.get(nodeKey(0, "Form"));
    if (form == null) {
      throw new Error("Expected the Form box to be placed");
    }
    const formBands = Array.from(layout.bands.values()).filter(
      (band) =>
        band.sourceX === form.x + FLOW_NODE_WIDTH &&
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

  it("titles each step above its boxes", () => {
    const layout = setup();

    expect(layout.stepTitles.map((title) => title.text)).toEqual([
      "Lead type",
      "Booking",
      "Outcome",
    ]);
    expect(layout.stepTitles[0].anchor).toBe("end");
    expect(layout.stepTitles[2].anchor).toBe("start");
  });
});
