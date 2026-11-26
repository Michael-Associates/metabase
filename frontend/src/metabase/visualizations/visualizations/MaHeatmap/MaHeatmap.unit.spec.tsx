import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { ThemeProvider } from "metabase/ui";
import type { VisualizationProps } from "metabase/visualizations/types";
import type {
  DatasetColumn,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
  createMockSingleSeries,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { MaHeatmap } from "./MaHeatmap";

jest.mock("@mantine/hooks", () => ({
  ...jest.requireActual<Record<string, unknown>>("@mantine/hooks"),
  useElementSize: () => ({ ref: { current: null }, width: 640, height: 360 }),
}));

const AGENT_COLUMN = createMockColumn({
  id: 1,
  name: "agent",
  display_name: "Agent",
  base_type: "type/Text",
  effective_type: "type/Text",
  source: "breakout",
});
const DAY_COLUMN = createMockNumericColumn({
  id: 2,
  name: "day",
  display_name: "Day",
  source: "breakout",
});
const COUNT_COLUMN = createMockNumericColumn({
  id: 3,
  name: "count",
  display_name: "Count",
  source: "aggregation",
});

const ROWS: RowValues[] = [
  ["Ana", 1, 12],
  ["Ana", 2, 5],
  ["Ana", 3, 9],
  ["Bob", 1, 3],
  ["Bob", 3, 20],
];

interface SetupOpts {
  rows?: RowValues[];
  visualizationSettings?: VisualizationSettings;
  isClickable?: boolean;
}

const setup = ({
  rows = ROWS,
  visualizationSettings = {},
  isClickable = true,
}: SetupOpts = {}) => {
  const card = createMockCard({ display: "ma_heatmap" });
  const series = createMockSingleSeries(
    card,
    createMockDataset({
      data: createMockDatasetData({
        cols: [AGENT_COLUMN, DAY_COLUMN, COUNT_COLUMN],
        rows,
      }),
    }),
  );
  const settings = {
    ...createMockVisualizationSettings({
      "ma_heatmap.rows": "agent",
      "ma_heatmap.columns": "day",
      "ma_heatmap.value": "count",
      ...visualizationSettings,
    }),
    column: (column: DatasetColumn) => ({ column }),
  };

  const onHoverChange = jest.fn<
    void,
    Parameters<VisualizationProps["onHoverChange"]>
  >();
  const onVisualizationClick = jest.fn<
    void,
    Parameters<VisualizationProps["onVisualizationClick"]>
  >();
  const onRender = jest.fn<void, Parameters<VisualizationProps["onRender"]>>();

  const props: VisualizationProps = {
    series: [series],
    rawSeries: [series],
    data: series.data,
    card,
    settings,
    fontFamily: "Lato",
    isFullscreen: false,
    isQueryBuilder: false,
    isEmbeddingSdk: false,
    showTitle: false,
    isDashboard: false,
    isDocument: false,
    isVisualizer: false,
    isVisualizerCard: false,
    isEditing: false,
    isMetricsViewer: false,
    isMobile: false,
    isSettings: false,
    width: 640,
    height: 400,
    visualizationIsClickable: () => isClickable,
    onRender,
    onRenderError: () => undefined,
    onActionDismissal: () => undefined,
    onHoverChange,
    onVisualizationClick,
    onUpdateVisualizationSettings: () => undefined,
    dispatch: jest.fn<unknown, [unknown]>(),
  };

  renderWithProviders(
    <ThemeProvider>
      <MaHeatmap {...props} />
    </ThemeProvider>,
  );

  return { onHoverChange, onVisualizationClick, onRender };
};

describe("MaHeatmap", () => {
  it("draws one cell for every row and column combination", () => {
    setup();

    expect(screen.getAllByTestId("ma-heatmap-cell")).toHaveLength(6);
  });

  it("labels the rows and the columns", () => {
    setup();

    expect(
      screen
        .getAllByTestId("ma-heatmap-row-label")
        .map((label) => label.textContent),
    ).toEqual(["Ana", "Bob"]);
    expect(
      screen
        .getAllByTestId("ma-heatmap-column-label")
        .map((label) => label.textContent),
    ).toEqual(["1", "2", "3"]);
  });

  it("writes the value inside each cell that has one", () => {
    setup();

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("leaves the values out when the setting is off", () => {
    setup({ visualizationSettings: { "ma_heatmap.show_values": false } });

    expect(screen.queryByText("12")).not.toBeInTheDocument();
  });

  it("explains empty cells in the legend", () => {
    setup();

    expect(screen.getByTestId("ma-heatmap-legend")).toHaveTextContent(
      "No data",
    );
  });

  it("hides the legend when the setting is off", () => {
    setup({ visualizationSettings: { "ma_heatmap.show_legend": false } });

    expect(screen.queryByTestId("ma-heatmap-legend")).not.toBeInTheDocument();
  });

  it("reports the hovered cell's row, column and value for the tooltip", async () => {
    const { onHoverChange } = setup();

    await userEvent.hover(screen.getAllByTestId("ma-heatmap-cell")[0]);

    expect(onHoverChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: [
          { key: "Agent", value: "Ana", col: AGENT_COLUMN },
          { key: "Day", value: 1, col: DAY_COLUMN },
          { key: "Count", value: 12, col: COUNT_COLUMN },
        ],
      }),
    );
  });

  it("drills through on both the row and the column of a clicked cell", async () => {
    const { onVisualizationClick } = setup();

    await userEvent.click(screen.getAllByTestId("ma-heatmap-cell")[5]);

    expect(onVisualizationClick).toHaveBeenCalledTimes(1);
    expect(onVisualizationClick).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 20,
        column: COUNT_COLUMN,
        dimensions: [
          { value: "Bob", column: AGENT_COLUMN },
          { value: 3, column: DAY_COLUMN },
        ],
      }),
    );
  });

  it("does nothing when a cell without data is clicked", async () => {
    const { onVisualizationClick } = setup();

    await userEvent.click(screen.getAllByTestId("ma-heatmap-cell")[4]);

    expect(onVisualizationClick).not.toHaveBeenCalled();
  });

  it("does nothing on click when the question can't be drilled into", async () => {
    const { onVisualizationClick } = setup({ isClickable: false });

    await userEvent.click(screen.getAllByTestId("ma-heatmap-cell")[0]);

    expect(onVisualizationClick).not.toHaveBeenCalled();
  });

  it("warns when the same row and column appear more than once", () => {
    const { onRender } = setup({
      rows: [...ROWS, ["Ana", 1, 99]],
    });

    expect(onRender).toHaveBeenLastCalledWith({
      warnings: [
        "Some cells have more than one value. The heatmap shows the first one.",
      ],
    });
  });

  it("does not warn when every combination appears once", () => {
    const { onRender } = setup();

    expect(onRender).toHaveBeenLastCalledWith({ warnings: [] });
  });
});
