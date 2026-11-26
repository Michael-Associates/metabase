import type { DatasetColumn, RowValues } from "metabase-types/api";
import {
  createMockColumn,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

import { getAxisKey } from "../MaShared/axis";

import { ENDED_COLOR_KEY, type FlowNodeOrder } from "./constants";
import {
  type FlowModel,
  getFlowColumns,
  getFlowModel,
  getFlowSize,
  getNodeKey,
  getTracedLinkValues,
} from "./model";

const textColumn = (name: string) =>
  createMockColumn({
    name,
    display_name: name,
    base_type: "type/Text",
    effective_type: "type/Text",
    source: "breakout",
  });

const LEAD_TYPE = textColumn("lead_type");
const BOOKING = textColumn("booking");
const OUTCOME = textColumn("outcome");
const COUNT = createMockNumericColumn({
  name: "count",
  display_name: "Count",
  source: "aggregation",
});
const COLS = [LEAD_TYPE, BOOKING, OUTCOME, COUNT];

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

interface SetupOpts {
  rows?: RowValues[];
  cols?: DatasetColumn[];
  colorBy?: string;
  nodeOrder?: FlowNodeOrder;
}

const setup = ({
  rows = ROWS,
  cols = COLS,
  colorBy = "lead_type",
  nodeOrder = "size",
}: SetupOpts = {}) => {
  const columns = getFlowColumns(cols, {
    steps: ["lead_type", "booking", "outcome"],
    value: "count",
    colorBy,
  });
  if (columns == null) {
    throw new Error("Expected the flow columns to resolve");
  }
  return { columns, model: getFlowModel(rows, columns, { nodeOrder }) };
};

const getLinkValue = (
  model: FlowModel,
  source: string,
  target: string,
  color: string,
) =>
  model.links.find(
    (link) =>
      link.sourceKey === source &&
      link.targetKey === target &&
      link.colorKey === color,
  )?.value;

describe("getFlowColumns", () => {
  it("resolves the steps, the value and the color-by step", () => {
    const columns = getFlowColumns(COLS, {
      steps: ["lead_type", "booking", "outcome"],
      value: "count",
      colorBy: "outcome",
    });

    expect(columns?.steps.map((step) => step.column)).toEqual([
      LEAD_TYPE,
      BOOKING,
      OUTCOME,
    ]);
    expect(columns?.value.column).toBe(COUNT);
    expect(columns?.colorStepIndex).toBe(2);
  });

  it("colors by the first step when the color-by column isn't a step", () => {
    const columns = getFlowColumns(COLS, {
      steps: ["lead_type", "booking"],
      value: "count",
      colorBy: "outcome",
    });

    expect(columns?.colorStepIndex).toBe(0);
  });

  it.each([
    ["only one step", ["lead_type"], "count"],
    ["a step missing from the result", ["lead_type", "removed"], "count"],
    ["the value used as a step", ["lead_type", "count"], "count"],
    ["no value", ["lead_type", "booking"], undefined],
  ])("returns null with %s", (_case, steps, value) => {
    expect(
      getFlowColumns(COLS, { steps, value, colorBy: undefined }),
    ).toBeNull();
  });

  it("ignores a step picked twice", () => {
    const columns = getFlowColumns(COLS, {
      steps: ["lead_type", "booking", "booking"],
      value: "count",
      colorBy: undefined,
    });

    expect(columns?.steps).toHaveLength(2);
  });
});

describe("getFlowModel", () => {
  it("adds every journey's size to each step it reaches", () => {
    const { model } = setup();

    expect(model.total).toBe(40);
    expect(model.nodesByKey.get(nodeKey(0, "Form"))?.total).toBe(25);
    expect(model.nodesByKey.get(nodeKey(1, "Screening"))?.total).toBe(14);
    expect(model.nodesByKey.get(nodeKey(2, "Won"))?.total).toBe(22);
  });

  it("ends a journey at its first empty step", () => {
    const { model } = setup();

    expect(model.nodesByKey.has(getNodeKey(1, getAxisKey(null)))).toBe(false);
    expect(model.nodesByKey.has(getNodeKey(2, getAxisKey(null)))).toBe(false);
    expect(model.skippedStepRowCount).toBe(0);
  });

  it("counts the rows that have a filled step after an empty one", () => {
    const { model } = setup({ rows: [...ROWS, ["Form", null, "Won", 3]] });

    expect(model.nodesByKey.get(nodeKey(0, "Form"))?.total).toBe(28);
    expect(model.nodesByKey.get(nodeKey(2, "Won"))?.total).toBe(22);
    expect(model.skippedStepRowCount).toBe(1);
  });

  it("adds up the bands between steps by color", () => {
    const { model } = setup();
    const form = getAxisKey("Form");
    const call = getAxisKey("Call");

    expect(model.links).toHaveLength(7);
    expect(
      getLinkValue(model, nodeKey(1, "Screening"), nodeKey(2, "Won"), form),
    ).toBe(4);
    expect(
      getLinkValue(model, nodeKey(1, "Screening"), nodeKey(2, "Won"), call),
    ).toBe(8);
  });

  it("marks bands of journeys that ended before the color-by step", () => {
    const { model } = setup({ colorBy: "outcome" });

    expect(model.colors.map((color) => color.value)).toEqual([
      "Won",
      "Lost",
      null,
    ]);
    expect(model.colors[2].isEnded).toBe(true);
    expect(
      getLinkValue(
        model,
        nodeKey(0, "Call"),
        nodeKey(1, "Screening"),
        ENDED_COLOR_KEY,
      ),
    ).toBe(2);
  });

  it("puts the largest boxes first by default", () => {
    const { model } = setup();

    expect(model.steps[1].map((node) => node.value)).toEqual([
      "Self",
      "Screening",
    ]);
  });

  it("keeps the order values first appear in the result when asked to", () => {
    const { model } = setup({
      rows: [["Call", "Screening", "Won", 1], ...ROWS],
      nodeOrder: "query",
    });

    expect(model.steps[0].map((node) => node.value)).toEqual(["Call", "Form"]);
    expect(model.steps[1].map((node) => node.value)).toEqual([
      "Screening",
      "Self",
    ]);
    expect(model.steps[2].map((node) => node.value)).toEqual(["Won", "Lost"]);
  });

  it("skips rows without a positive size and counts them", () => {
    const { model } = setup({
      rows: [
        ...ROWS,
        ["Form", "Self", "Won", 0],
        ["Call", "Self", "Won", null],
      ],
    });

    expect(model.total).toBe(40);
    expect(model.skippedRowCount).toBe(2);
  });
});

describe("getTracedLinkValues", () => {
  it("traces every journey through a box, before and after it", () => {
    const { model } = setup();
    const traced = getTracedLinkValues(model, {
      type: "node",
      key: nodeKey(1, "Self"),
    });

    expect(Array.from(traced.values()).sort((a, b) => a - b)).toEqual([
      5, 10, 15,
    ]);
  });

  it("traces only the journeys of the hovered band's color", () => {
    const { model } = setup();
    const band = model.links.find(
      (link) =>
        link.sourceKey === nodeKey(1, "Screening") &&
        link.colorKey === getAxisKey("Call"),
    );
    if (band == null) {
      throw new Error("Expected the band to exist");
    }
    const traced = getTracedLinkValues(model, { type: "link", key: band.key });

    expect(Array.from(traced.values())).toEqual([8, 8]);
  });
});

describe("getFlowSize", () => {
  it("counts the boxes and bands the chart would draw", () => {
    const { columns } = setup();

    expect(getFlowSize(ROWS, columns)).toEqual({
      nodeCount: 6,
      linkCount: 7,
      hasValues: true,
    });
  });

  it("counts again when the same result is drawn with other columns", () => {
    const rows = [...ROWS];
    const byLeadType = setup().columns;
    const byOutcome = setup({ colorBy: "outcome" }).columns;

    expect(getFlowSize(rows, byLeadType).linkCount).toBe(7);
    expect(getFlowSize(rows, byOutcome).linkCount).toBe(8);
    expect(getFlowSize(rows, byLeadType).linkCount).toBe(7);
  });
});
