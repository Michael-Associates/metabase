import { act, renderWithProviders, screen } from "__support__/ui";
import { ThemeProvider } from "metabase/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import type { VisualizationProps } from "metabase/visualizations/types";
import { getComputedSettingsForSeries } from "metabase/viz-core";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { MaGraph } from "./MaGraph";

registerVisualizations();

jest.mock("@mantine/hooks", () => ({
  ...jest.requireActual<Record<string, unknown>>("@mantine/hooks"),
  useElementSize: () => ({ ref: { current: null }, width: 800, height: 400 }),
}));

const GRAPH_HTML = "<!doctype html><svg id='chart'></svg>";

class FakePort {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage = jest.fn<void, [unknown]>();
  close = jest.fn<void, []>();
}

class FakeMessageChannel {
  static channels: FakeMessageChannel[] = [];
  port1 = new FakePort();
  port2 = new FakePort();

  constructor() {
    FakeMessageChannel.channels.push(this);
  }
}

const setup = () => {
  const card = createMockCard({
    display: "ma_graph",
    visualization_settings: { "ma_graph.html": GRAPH_HTML },
  });
  const series = createMockSingleSeries(
    card,
    createMockDataset({
      data: createMockDatasetData({
        cols: [
          createMockColumn({ name: "SOURCE", display_name: "Source" }),
          createMockNumericColumn({ name: "count", display_name: "Count" }),
        ],
        rows: [
          ["Google", 12],
          ["Twitter", 7],
        ],
      }),
    }),
  );
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
    width: 800,
    height: 400,
    visualizationIsClickable: () => false,
    onRender: () => undefined,
    onRenderError: () => undefined,
    onActionDismissal: () => undefined,
    onHoverChange: () => undefined,
    onVisualizationClick: () => undefined,
    onUpdateVisualizationSettings: () => undefined,
    dispatch: jest.fn<unknown, [unknown]>(),
  };

  renderWithProviders(
    <ThemeProvider>
      <MaGraph {...props} />
    </ThemeProvider>,
  );

  const frame = screen.getByTestId("ma-graph-frame");
  if (!(frame instanceof HTMLIFrameElement) || frame.contentWindow == null) {
    throw new Error("Expected the graph's frame to have a window");
  }
  const frameWindow = frame.contentWindow;
  const postMessage = jest
    .spyOn(frameWindow, "postMessage")
    .mockImplementation(() => undefined);

  const sendFromFrame = (data: unknown, source: Window = frameWindow) => {
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data, source }));
    });
  };

  return { frame, postMessage, sendFromFrame };
};

describe("MaGraph", () => {
  const originalMessageChannel = window.MessageChannel;

  beforeEach(() => {
    FakeMessageChannel.channels = [];
    Object.defineProperty(window, "MessageChannel", {
      value: FakeMessageChannel,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "MessageChannel", {
      value: originalMessageChannel,
      configurable: true,
      writable: true,
    });
  });

  it("runs the graph in a sealed frame served by the backend", () => {
    const { frame } = setup();

    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame).toHaveAttribute(
      "src",
      expect.stringMatching(/\/api\/ma-graph\/frame$/),
    );
  });

  it("sends the graph, the results and the size once the frame is ready", () => {
    const { postMessage, sendFromFrame } = setup();

    expect(postMessage).not.toHaveBeenCalled();
    sendFromFrame({ type: "ma-graph:ready" });

    const [channel] = FakeMessageChannel.channels;
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: "ma-graph:render",
        html: GRAPH_HTML,
        data: {
          columns: [
            expect.objectContaining({ name: "SOURCE", displayName: "Source" }),
            expect.objectContaining({ name: "count", displayName: "Count" }),
          ],
          rows: [
            ["Google", 12],
            ["Twitter", 7],
          ],
        },
        context: { width: 800, height: 400, colorScheme: "light" },
      },
      "*",
      [channel.port2],
    );
  });

  it("answers only its own frame, and only once", () => {
    const { postMessage, sendFromFrame } = setup();

    sendFromFrame({ type: "ma-graph:ready" }, window);
    expect(postMessage).not.toHaveBeenCalled();

    sendFromFrame({ type: "ma-graph:ready" });
    sendFromFrame({ type: "ma-graph:ready" });
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it("shows the graph's own error in the card", () => {
    const { sendFromFrame } = setup();
    sendFromFrame({ type: "ma-graph:ready" });

    const [channel] = FakeMessageChannel.channels;
    act(() => {
      channel.port1.onmessage?.({
        data: { type: "error", message: "records is undefined" },
      });
    });

    expect(screen.getByTestId("ma-graph-error")).toHaveTextContent(
      "records is undefined",
    );
  });
});
