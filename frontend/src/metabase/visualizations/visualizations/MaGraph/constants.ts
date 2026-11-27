export const MA_GRAPH_SETTING_KEYS = {
  html: "ma_graph.html",
} as const;

/** The sandboxed page a custom graph runs in, served by the backend. */
export const MA_GRAPH_FRAME_PATH = "/api/ma-graph/frame";

export const MA_GRAPH_MESSAGES = {
  ready: "ma-graph:ready",
  render: "ma-graph:render",
  update: "update",
  error: "error",
} as const;
