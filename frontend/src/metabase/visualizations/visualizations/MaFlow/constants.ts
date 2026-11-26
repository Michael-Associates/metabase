export const FLOW_SETTING_KEYS = {
  steps: "ma_flow.steps",
  value: "ma_flow.value",
  colorBy: "ma_flow.color_by",
  nodeOrder: "ma_flow.node_order",
  showValues: "ma_flow.show_values",
  showLegend: "ma_flow.show_legend",
} as const;

export const MIN_FLOW_STEPS = 2;
export const MAX_FLOW_STEPS = 8;
export const MAX_FLOW_NODES = 300;
export const MAX_FLOW_LINKS = 2000;

export const FLOW_NODE_ORDERS = ["size", "query"] as const;
export type FlowNodeOrder = (typeof FLOW_NODE_ORDERS)[number];

export const ENDED_COLOR_KEY = "journey-ended";
