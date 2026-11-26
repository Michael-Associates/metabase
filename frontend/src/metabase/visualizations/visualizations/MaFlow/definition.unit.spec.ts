import { registerVisualizations } from "metabase/visualizations/register";
import { getComputedSettingsForSeries } from "metabase/viz-core";
import type {
  DatasetColumn,
  RawSeries,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

import { MAX_FLOW_NODES } from "./constants";
import { MA_FLOW_DEFINITION } from "./definition";

registerVisualizations();

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
const QUERY_BUILDER_COLS = [LEAD_TYPE, BOOKING, OUTCOME, COUNT];

interface SetupOpts {
  cols?: DatasetColumn[];
  rows?: RowValues[];
  visualizationSettings?: VisualizationSettings;
}

const setup = ({
  cols = QUERY_BUILDER_COLS,
  rows = [
    ["Form", "Self", "Won", 10],
    ["Call", "Screening", "Lost", 4],
  ],
  visualizationSettings = {},
}: SetupOpts = {}) => {
  const series: RawSeries = [
    {
      card: createMockCard({
        display: "ma_flow",
        visualization_settings: visualizationSettings,
      }),
      data: createMockDatasetData({ cols, rows }),
    },
  ];
  const settings = getComputedSettingsForSeries(series);
  const checkRenderable = () =>
    MA_FLOW_DEFINITION.checkRenderable(series, settings);
  return { settings, checkRenderable };
};

describe("MA_FLOW_DEFINITION settings", () => {
  it("uses every grouping as a step, the metric as the size, and colors by the first step", () => {
    const { settings } = setup();

    expect(settings["ma_flow.steps"]).toEqual([
      "lead_type",
      "booking",
      "outcome",
    ]);
    expect(settings["ma_flow.value"]).toBe("count");
    expect(settings["ma_flow.color_by"]).toBe("lead_type");
    expect(settings["ma_flow.node_order"]).toBe("size");
  });

  it("uses every column but the last one as a step for a SQL result made only of numbers", () => {
    const { settings } = setup({
      cols: ["year", "month", "calls"].map((name) =>
        createMockNumericColumn({ name, display_name: name, source: "native" }),
      ),
      rows: [[2026, 1, 12]],
    });

    expect(settings["ma_flow.steps"]).toEqual(["year", "month"]);
    expect(settings["ma_flow.value"]).toBe("calls");
  });

  it("keeps the steps and colors people chose", () => {
    const { settings } = setup({
      visualizationSettings: {
        "ma_flow.steps": ["booking", "outcome"],
        "ma_flow.color_by": "outcome",
      },
    });

    expect(settings["ma_flow.steps"]).toEqual(["booking", "outcome"]);
    expect(settings["ma_flow.color_by"]).toBe("outcome");
  });

  it("goes back to the first step's colors when the color-by column is no longer a step", () => {
    const { settings } = setup({
      visualizationSettings: {
        "ma_flow.steps": ["lead_type", "booking"],
        "ma_flow.color_by": "outcome",
      },
    });

    expect(settings["ma_flow.color_by"]).toBe("lead_type");
  });
});

describe("MA_FLOW_DEFINITION.checkRenderable", () => {
  it("accepts groupings and a metric", () => {
    const { checkRenderable } = setup();

    expect(checkRenderable).not.toThrow();
  });

  it("asks for columns when there aren't two different steps", () => {
    const { checkRenderable } = setup({
      visualizationSettings: { "ma_flow.steps": ["lead_type", "lead_type"] },
    });

    expect(checkRenderable).toThrow("Pick at least two different steps");
  });

  it("refuses more boxes than it can draw", () => {
    const rows = Array.from(
      { length: MAX_FLOW_NODES },
      (_, index): RowValues => [`Lead ${index}`, "Self", "Won", 1],
    );
    const { checkRenderable } = setup({ rows });

    expect(checkRenderable).toThrow(
      `A flow chart can show up to ${MAX_FLOW_NODES} boxes`,
    );
  });

  it("explains when no journey has a positive size", () => {
    const { checkRenderable } = setup({
      rows: [
        ["Form", "Self", "Won", 0],
        ["Call", "Screening", "Lost", null],
      ],
    });

    expect(checkRenderable).toThrow(
      "The size column has no positive numbers to draw.",
    );
  });
});

describe("MA_FLOW_DEFINITION.isSensible", () => {
  it("is sensible for two or more groupings and a metric", () => {
    expect(
      MA_FLOW_DEFINITION.isSensible?.(
        createMockDatasetData({
          cols: QUERY_BUILDER_COLS,
          rows: [["Form", "Self", "Won", 10]],
        }),
      ),
    ).toBe(true);
  });

  it("is not sensible with a single grouping", () => {
    expect(
      MA_FLOW_DEFINITION.isSensible?.(
        createMockDatasetData({
          cols: [LEAD_TYPE, COUNT],
          rows: [["Form", 10]],
        }),
      ),
    ).toBe(false);
  });
});
