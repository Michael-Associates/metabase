import type { RawSeries } from "metabase-types/api";
import { createMockDatasetData } from "metabase-types/api/mocks";

import { MA_GRAPH_DEFINITION } from "./definition";

describe("MA_GRAPH_DEFINITION", () => {
  it("is never suggested for a result, so a link can't turn a question into a graph", () => {
    expect(
      MA_GRAPH_DEFINITION.isSensible?.(
        createMockDatasetData({ rows: [["Google", 12]] }),
      ),
    ).toBe(false);
  });

  it("asks for the graph's code when the card has none", () => {
    const series: RawSeries = [];

    expect(() =>
      MA_GRAPH_DEFINITION.checkRenderable(series, { "ma_graph.html": " " }),
    ).toThrow("Add the graph's code");
    expect(() =>
      MA_GRAPH_DEFINITION.checkRenderable(series, {
        "ma_graph.html": "<p>graph</p>",
      }),
    ).not.toThrow();
  });
});
