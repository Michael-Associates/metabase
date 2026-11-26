import type {
  DatasetData,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";

import { readStringSetting } from "../MaShared/settings";

import { MA_GRAPH_MESSAGES, MA_GRAPH_SETTING_KEYS } from "./constants";

export type GraphColumn = {
  name: string;
  displayName: string;
  baseType: string;
  semanticType: string | null;
};

/** The results a graph draws from, as the page receives them. */
export type GraphData = {
  columns: GraphColumn[];
  rows: RowValue[][];
};

/** What the page knows about where it is drawn. */
export type GraphContext = {
  width: number;
  height: number;
  colorScheme: "light" | "dark";
};

export type GraphErrorMessage = {
  type: typeof MA_GRAPH_MESSAGES.error;
  message: string;
};

/**
 * The graph's HTML page, or `undefined` when the card has none yet.
 */
export function getGraphHtml(
  settings: VisualizationSettings,
): string | undefined {
  const html = readStringSetting(settings, MA_GRAPH_SETTING_KEYS.html);
  return html != null && html.trim() !== "" ? html : undefined;
}

/**
 * The card's results in the shape the graph's page gets: columns by their
 * output name, and rows as arrays in column order.
 */
export function getGraphData({ cols, rows }: DatasetData): GraphData {
  return {
    columns: cols.map((col) => ({
      name: col.name,
      displayName: col.display_name,
      baseType: col.base_type,
      semanticType: col.semantic_type ?? null,
    })),
    rows,
  };
}

export function isReadyMessage(message: unknown): boolean {
  return isMessageOfType(message, MA_GRAPH_MESSAGES.ready);
}

export function isErrorMessage(message: unknown): message is GraphErrorMessage {
  return (
    isMessageOfType(message, MA_GRAPH_MESSAGES.error) &&
    typeof message.message === "string"
  );
}

function isMessageOfType(
  message: unknown,
  type: string,
): message is { type: string; [key: string]: unknown } {
  return (
    typeof message === "object" &&
    message != null &&
    "type" in message &&
    message.type === type
  );
}
