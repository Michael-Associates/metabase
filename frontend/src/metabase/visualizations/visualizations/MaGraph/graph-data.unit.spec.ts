import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import {
  getGraphData,
  getGraphHtml,
  isErrorMessage,
  isReadyMessage,
} from "./graph-data";

describe("getGraphHtml", () => {
  it("returns the graph's page", () => {
    expect(getGraphHtml({ "ma_graph.html": "<p>graph</p>" })).toBe(
      "<p>graph</p>",
    );
  });

  it("treats a missing or blank page as none", () => {
    expect(getGraphHtml({})).toBeUndefined();
    expect(getGraphHtml({ "ma_graph.html": "  \n " })).toBeUndefined();
  });
});

describe("getGraphData", () => {
  it("passes the columns by their output name and the rows in column order", () => {
    const data = createMockDatasetData({
      cols: [
        createMockColumn({
          name: "SOURCE",
          display_name: "Source",
          base_type: "type/Text",
          semantic_type: "type/Source",
        }),
        createMockColumn({
          name: "count",
          display_name: "Count",
          base_type: "type/Integer",
          semantic_type: null,
        }),
      ],
      rows: [
        ["Google", 12],
        ["Twitter", 7],
      ],
    });

    expect(getGraphData(data)).toEqual({
      columns: [
        {
          name: "SOURCE",
          displayName: "Source",
          baseType: "type/Text",
          semanticType: "type/Source",
        },
        {
          name: "count",
          displayName: "Count",
          baseType: "type/Integer",
          semanticType: null,
        },
      ],
      rows: [
        ["Google", 12],
        ["Twitter", 7],
      ],
    });
  });
});

describe("graph messages", () => {
  it("recognizes the frame's ready message", () => {
    expect(isReadyMessage({ type: "ma-graph:ready" })).toBe(true);
    expect(isReadyMessage({ type: "ma-graph:render" })).toBe(false);
    expect(isReadyMessage("ma-graph:ready")).toBe(false);
    expect(isReadyMessage(null)).toBe(false);
  });

  it("recognizes an error message only with its text", () => {
    expect(isErrorMessage({ type: "error", message: "boom" })).toBe(true);
    expect(isErrorMessage({ type: "error" })).toBe(false);
    expect(isErrorMessage({ type: "update", message: "boom" })).toBe(false);
  });
});
