import { color } from "metabase/ui/colors";
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

import { MAX_HEATMAP_CELLS } from "./constants";
import { MA_HEATMAP_DEFINITION } from "./definition";

registerVisualizations();

const AGENT_COLUMN = createMockColumn({
  name: "agent",
  display_name: "Agent",
  base_type: "type/Text",
  effective_type: "type/Text",
  source: "breakout",
});
const DAY_COLUMN = createMockNumericColumn({
  name: "day",
  display_name: "Day",
  source: "breakout",
});
const COUNT_COLUMN = createMockNumericColumn({
  name: "count",
  display_name: "Count",
  source: "aggregation",
});
const QUERY_BUILDER_COLS = [AGENT_COLUMN, DAY_COLUMN, COUNT_COLUMN];

interface SetupOpts {
  cols?: DatasetColumn[];
  rows?: RowValues[];
  visualizationSettings?: VisualizationSettings;
}

const setup = ({
  cols = QUERY_BUILDER_COLS,
  rows = [
    ["Ana", 1, 4],
    ["Bob", 2, 6],
  ],
  visualizationSettings = {},
}: SetupOpts = {}) => {
  const series: RawSeries = [
    {
      card: createMockCard({
        display: "ma_heatmap",
        visualization_settings: visualizationSettings,
      }),
      data: createMockDatasetData({ cols, rows }),
    },
  ];
  const settings = getComputedSettingsForSeries(series);
  const checkRenderable = () =>
    MA_HEATMAP_DEFINITION.checkRenderable(series, settings);
  return { settings, checkRenderable };
};

describe("MA_HEATMAP_DEFINITION settings", () => {
  it("puts the two groupings on the rows and columns and the metric in the cells", () => {
    const { settings } = setup();

    expect(settings["ma_heatmap.rows"]).toBe("agent");
    expect(settings["ma_heatmap.columns"]).toBe("day");
    expect(settings["ma_heatmap.value"]).toBe("count");
  });

  it("picks three different columns for a SQL result made only of numbers", () => {
    const { settings } = setup({
      cols: ["hour", "weekday", "calls"].map((name) =>
        createMockNumericColumn({ name, display_name: name, source: "native" }),
      ),
      rows: [[9, 1, 12]],
    });

    expect(settings["ma_heatmap.rows"]).toBe("hour");
    expect(settings["ma_heatmap.columns"]).toBe("weekday");
    expect(settings["ma_heatmap.value"]).toBe("calls");
  });

  it("keeps the columns people chose", () => {
    const { settings } = setup({
      visualizationSettings: {
        "ma_heatmap.rows": "day",
        "ma_heatmap.columns": "agent",
      },
    });

    expect(settings["ma_heatmap.rows"]).toBe("day");
    expect(settings["ma_heatmap.columns"]).toBe("agent");
    expect(settings["ma_heatmap.value"]).toBe("count");
  });

  it("falls back to the default color when the saved one is not a color", () => {
    const { settings } = setup({
      visualizationSettings: { "ma_heatmap.color": "not a color" },
    });

    expect(settings["ma_heatmap.color"]).toBe(color("brand"));
  });
});

describe("MA_HEATMAP_DEFINITION.checkRenderable", () => {
  it("accepts a result with two groupings and a metric", () => {
    const { checkRenderable } = setup();

    expect(checkRenderable).not.toThrow();
  });

  it("accepts an empty result", () => {
    const { checkRenderable } = setup({ rows: [] });

    expect(checkRenderable).not.toThrow();
  });

  it("asks for different columns when rows and columns use the same one", () => {
    const { checkRenderable } = setup({
      visualizationSettings: {
        "ma_heatmap.rows": "agent",
        "ma_heatmap.columns": "agent",
      },
    });

    expect(checkRenderable).toThrow(
      "Pick a column for the rows, another for the columns",
    );
  });

  it("refuses grids with more cells than it can draw", () => {
    const agentCount = MAX_HEATMAP_CELLS / 100 + 1;
    const rows = Array.from({ length: agentCount }, (_, agent) =>
      Array.from({ length: 100 }, (_, day): RowValues => [`A${agent}`, day, 1]),
    ).flat();
    const { checkRenderable } = setup({ rows });

    expect(checkRenderable).toThrow(
      `A heatmap can show up to ${MAX_HEATMAP_CELLS} cells, and this one would need ${agentCount * 100}.`,
    );
  });

  it("explains when there are no numbers to color the cells with", () => {
    const { checkRenderable } = setup({
      rows: [
        ["Ana", 1, null],
        ["Bob", 2, null],
      ],
    });

    expect(checkRenderable).toThrow(
      "The value column has no numbers to color the cells with.",
    );
  });
});

describe("MA_HEATMAP_DEFINITION.isSensible", () => {
  it("is sensible for two groupings and a metric", () => {
    expect(
      MA_HEATMAP_DEFINITION.isSensible?.(
        createMockDatasetData({
          cols: QUERY_BUILDER_COLS,
          rows: [["Ana", 1, 4]],
        }),
      ),
    ).toBe(true);
  });

  it("is not sensible without a separate column for the cell values", () => {
    expect(
      MA_HEATMAP_DEFINITION.isSensible?.(
        createMockDatasetData({
          cols: [DAY_COLUMN, COUNT_COLUMN],
          rows: [[1, 4]],
        }),
      ),
    ).toBe(false);
  });
});
