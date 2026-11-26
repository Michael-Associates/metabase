import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { ThemeProvider } from "metabase/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import type { VisualizationProps } from "metabase/visualizations/types";
import { getComputedSettingsForSeries } from "metabase/viz-core";
import type { RowValues, VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { MaFlow } from "./MaFlow";

registerVisualizations();

jest.mock("@mantine/hooks", () => ({
  ...jest.requireActual<Record<string, unknown>>("@mantine/hooks"),
  useElementSize: () => ({ ref: { current: null }, width: 900, height: 500 }),
}));

const textColumn = (name: string, displayName: string) =>
  createMockColumn({
    name,
    display_name: displayName,
    base_type: "type/Text",
    effective_type: "type/Text",
    source: "breakout",
  });

const LEAD_TYPE = textColumn("lead_type", "Lead type");
const BOOKING = textColumn("booking", "Booking");
const OUTCOME = textColumn("outcome", "Outcome");
const COUNT = createMockNumericColumn({
  name: "count",
  display_name: "Count",
  source: "aggregation",
});

const ROWS: RowValues[] = [
  ["Form", "Self", "Won", 10],
  ["Form", "Self", "Lost", 5],
  ["Form", "Screening", "Won", 4],
  ["Form", null, null, 6],
  ["Call", "Screening", "Won", 8],
  ["Call", "Screening", null, 2],
  ["Call", null, null, 5],
];

interface SetupOpts {
  rows?: RowValues[];
  visualizationSettings?: VisualizationSettings;
}

const setup = ({ rows = ROWS, visualizationSettings = {} }: SetupOpts = {}) => {
  const card = createMockCard({
    display: "ma_flow",
    visualization_settings: visualizationSettings,
  });
  const series = createMockSingleSeries(
    card,
    createMockDataset({
      data: createMockDatasetData({
        cols: [LEAD_TYPE, BOOKING, OUTCOME, COUNT],
        rows,
      }),
    }),
  );
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
    settings: getComputedSettingsForSeries([series]),
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
    width: 900,
    height: 540,
    visualizationIsClickable: () => true,
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
      <MaFlow {...props} />
    </ThemeProvider>,
  );

  return { onHoverChange, onVisualizationClick, onRender };
};

const getNode = (value: string) => {
  const node = screen
    .getAllByTestId("ma-flow-node")
    .find((element) =>
      element.getAttribute("data-node")?.includes(`"string:${value}"`),
    );
  if (node == null) {
    throw new Error(`No box for ${value}`);
  }
  return node;
};

const getBandTo = (value: string) => {
  const band = screen
    .getAllByTestId("ma-flow-band")
    .find((element) => element.getAttribute("data-link")?.includes(value));
  if (band == null) {
    throw new Error(`No band to ${value}`);
  }
  return band;
};

describe("MaFlow", () => {
  it("draws a box for every value at every step and a band for every hop", () => {
    setup();

    expect(screen.getAllByTestId("ma-flow-node")).toHaveLength(6);
    expect(screen.getAllByTestId("ma-flow-band")).toHaveLength(7);
  });

  it("titles every step", () => {
    setup();

    expect(
      screen
        .getAllByTestId("ma-flow-step-title")
        .map((title) => title.textContent),
    ).toEqual(["Lead type", "Booking", "Outcome"]);
  });

  it("labels the boxes with their count and share of all journeys", () => {
    setup();

    expect(
      screen.getAllByTestId("ma-flow-label").map((label) => label.textContent),
    ).toContain("Form25 · 62.5%");
  });

  it("lists the colors in the legend", () => {
    setup();

    expect(screen.getByTestId("ma-flow-legend")).toHaveTextContent(
      "Lead typeFormCall",
    );
  });

  it("traces every journey through a hovered box and breaks it down by color", async () => {
    const { onHoverChange } = setup();

    await userEvent.hover(getNode("Self"));

    expect(screen.getAllByTestId("ma-flow-traced-band")).toHaveLength(3);
    expect(onHoverChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        stackedTooltipModel: expect.objectContaining({
          headerTitle: "Booking: Self",
          grandTotal: 40,
          bodyRows: [expect.objectContaining({ name: "Form", value: 15 })],
        }),
      }),
    );
  });

  it("describes a hovered band", async () => {
    const { onHoverChange } = setup();

    await userEvent.hover(getBandTo("Lost"));

    expect(onHoverChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ key: "Booking", value: "Self" }),
          expect.objectContaining({ key: "Outcome", value: "Lost" }),
          expect.objectContaining({ key: "Lead type", value: "Form" }),
          expect.objectContaining({ key: "Count", value: 5 }),
        ],
      }),
    );
  });

  it("stops tracing when the pointer leaves the chart", async () => {
    const { onHoverChange } = setup();

    await userEvent.hover(getNode("Self"));
    await userEvent.unhover(screen.getByRole("img"));

    expect(screen.queryAllByTestId("ma-flow-traced-band")).toHaveLength(0);
    expect(onHoverChange).toHaveBeenLastCalledWith(null);
  });

  it("drills through on both steps of a clicked band", async () => {
    const { onVisualizationClick } = setup();

    await userEvent.click(getBandTo("Lost"));

    expect(onVisualizationClick).toHaveBeenCalledTimes(1);
    expect(onVisualizationClick).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 5,
        column: expect.objectContaining({ name: "count" }),
        dimensions: [
          expect.objectContaining({ value: "Self" }),
          expect.objectContaining({ value: "Lost" }),
        ],
      }),
    );
  });

  it("drills through on the step of a clicked box", async () => {
    const { onVisualizationClick } = setup();

    await userEvent.click(getNode("Call"));

    expect(onVisualizationClick).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 15,
        dimensions: [expect.objectContaining({ value: "Call" })],
      }),
    );
  });

  it("warns when some rows can't be drawn", () => {
    const { onRender } = setup({ rows: [...ROWS, ["Form", "Self", "Won", 0]] });

    expect(onRender).toHaveBeenLastCalledWith({
      warnings: ["Rows with an empty, zero or negative size aren't drawn."],
    });
  });
});
