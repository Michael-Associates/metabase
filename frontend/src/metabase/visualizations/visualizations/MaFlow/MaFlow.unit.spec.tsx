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

import { getAxisKey } from "../MaShared/axis";

import { MaFlow } from "./MaFlow";
import { ENDED_COLOR_KEY } from "./constants";
import { getLinkKey, getNodeKey, getValueColorKey } from "./model";

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

type StepValue = [stepIndex: number, value: string];

const nodeKey = ([stepIndex, value]: StepValue) =>
  getNodeKey(stepIndex, getAxisKey(value));

const linkKey = (source: StepValue, target: StepValue, colorKey: string) =>
  getLinkKey(nodeKey(source), nodeKey(target), colorKey);

const getNode = (stepValue: StepValue) => {
  const key = nodeKey(stepValue);
  const node = screen
    .getAllByTestId("ma-flow-node")
    .find((element) => element.getAttribute("data-node") === key);
  if (node == null) {
    throw new Error(`No box for ${key}`);
  }
  return node;
};

const getBand = (key: string) => {
  const band = screen
    .getAllByTestId("ma-flow-band")
    .find((element) => element.getAttribute("data-link") === key);
  if (band == null) {
    throw new Error(`No band for ${key}`);
  }
  return band;
};

const FORM = getValueColorKey("Form");

const dimension = (value: string, columnName: string) => ({
  value,
  column: expect.objectContaining({ name: columnName }),
});

describe("MaFlow", () => {
  it("draws a box for every value at every step and a band for every hop", () => {
    setup();

    expect(screen.getAllByTestId("ma-flow-node")).toHaveLength(6);
    expect(screen.getAllByTestId("ma-flow-band")).toHaveLength(7);
  });

  it("titles every step in uppercase", () => {
    setup();

    expect(
      screen
        .getAllByTestId("ma-flow-step-title")
        .map((title) => title.textContent),
    ).toEqual(["LEAD TYPE", "BOOKING", "OUTCOME"]);
  });

  it("labels the boxes with their count and share of all journeys", () => {
    setup();

    expect(
      screen.getAllByTestId("ma-flow-label").map((label) => label.textContent),
    ).toContain("Form25 · 62.5%");
  });

  it("labels the boxes with their names only when counts are turned off", () => {
    setup({ visualizationSettings: { "ma_flow.show_values": false } });

    const labels = screen
      .getAllByTestId("ma-flow-label")
      .map((label) => label.textContent);
    expect(labels).toContain("Form");
    expect(labels.some((label) => label?.includes("%"))).toBe(false);
  });

  it("lists the colors in the legend", () => {
    setup();

    expect(screen.getByTestId("ma-flow-legend")).toHaveTextContent(
      "Lead typeFormCall",
    );
  });

  it("names the journeys that ended before the color-by step in the legend", () => {
    setup({ visualizationSettings: { "ma_flow.color_by": "outcome" } });

    expect(screen.getByTestId("ma-flow-legend")).toHaveTextContent(
      "OutcomeWonLostEnded before this step",
    );
  });

  it("hides the legend when it is turned off", () => {
    setup({ visualizationSettings: { "ma_flow.show_legend": false } });

    expect(screen.queryByTestId("ma-flow-legend")).not.toBeInTheDocument();
  });

  it("traces every journey through a hovered box and breaks it down by color", async () => {
    const { onHoverChange } = setup();

    await userEvent.hover(getNode([1, "Screening"]));

    expect(screen.getAllByTestId("ma-flow-traced-band")).toHaveLength(4);
    expect(onHoverChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        stackedTooltipModel: expect.objectContaining({
          headerTitle: "Booking: Screening",
          grandTotal: 40,
          bodyRows: [
            expect.objectContaining({ name: "Form", value: 4 }),
            expect.objectContaining({ name: "Call", value: 10 }),
          ],
        }),
      }),
    );
  });

  it("shows the value and share of a hovered box of one color", async () => {
    const { onHoverChange } = setup();

    await userEvent.hover(getNode([1, "Self"]));

    expect(onHoverChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ key: "Booking", value: "Self" }),
          expect.objectContaining({ key: "Lead type", value: "Form" }),
          expect.objectContaining({ key: "Count", value: 15 }),
        ],
        footerData: [
          expect.objectContaining({
            key: "Share of all journeys",
            value: "37.5%",
          }),
        ],
      }),
    );
  });

  it("describes a hovered band", async () => {
    const { onHoverChange } = setup();

    await userEvent.hover(getBand(linkKey([1, "Self"], [2, "Lost"], FORM)));

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

  it("stops tracing when the pointer moves to empty space in the chart", async () => {
    const { onHoverChange } = setup();

    await userEvent.hover(getNode([1, "Self"]));
    await userEvent.hover(screen.getByRole("img"));

    expect(screen.queryAllByTestId("ma-flow-traced-band")).toHaveLength(0);
    expect(onHoverChange).toHaveBeenLastCalledWith(null);
  });

  it("stops tracing when the pointer leaves the chart", async () => {
    const { onHoverChange } = setup();

    await userEvent.hover(getNode([1, "Self"]));
    await userEvent.unhover(screen.getByRole("img"));

    expect(screen.queryAllByTestId("ma-flow-traced-band")).toHaveLength(0);
    expect(onHoverChange).toHaveBeenLastCalledWith(null);
  });

  it("drills through on a band's two steps and its color when the hop has several colors", async () => {
    const { onVisualizationClick } = setup();

    await userEvent.click(getBand(linkKey([1, "Screening"], [2, "Won"], FORM)));

    expect(onVisualizationClick).toHaveBeenCalledTimes(1);
    expect(onVisualizationClick).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 4,
        column: expect.objectContaining({ name: "count" }),
        dimensions: [
          dimension("Form", "lead_type"),
          dimension("Screening", "booking"),
          dimension("Won", "outcome"),
        ],
      }),
    );
  });

  it("drills through on a band's two steps when it is colored by one of them", async () => {
    const { onVisualizationClick } = setup({
      visualizationSettings: { "ma_flow.color_by": "booking" },
    });

    await userEvent.click(
      getBand(linkKey([1, "Self"], [2, "Lost"], getValueColorKey("Self"))),
    );

    expect(onVisualizationClick).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 5,
        dimensions: [
          dimension("Self", "booking"),
          dimension("Lost", "outcome"),
        ],
      }),
    );
  });

  it("doesn't drill through on a band of journeys that ended before the color-by step", async () => {
    const { onVisualizationClick } = setup({
      visualizationSettings: { "ma_flow.color_by": "outcome" },
    });

    await userEvent.click(
      getBand(linkKey([0, "Call"], [1, "Screening"], ENDED_COLOR_KEY)),
    );

    expect(onVisualizationClick).not.toHaveBeenCalled();
  });

  it("drills through on the step of a clicked box", async () => {
    const { onVisualizationClick } = setup();

    await userEvent.click(getNode([0, "Call"]));

    expect(onVisualizationClick).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 15,
        dimensions: [dimension("Call", "lead_type")],
      }),
    );
  });

  it("warns when some rows can't be drawn", () => {
    const { onRender } = setup({ rows: [...ROWS, ["Form", "Self", "Won", 0]] });

    expect(onRender).toHaveBeenLastCalledWith({
      warnings: ["Rows with an empty, zero or negative size aren't drawn."],
    });
  });

  it("warns when some rows skip a step", () => {
    const { onRender } = setup({ rows: [...ROWS, ["Form", null, "Won", 3]] });

    expect(onRender).toHaveBeenLastCalledWith({
      warnings: [
        "Some rows have an empty step before a filled one. Their journeys are drawn only up to the empty step.",
      ],
    });
  });
});
