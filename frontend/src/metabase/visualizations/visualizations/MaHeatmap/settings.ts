import type { VisualizationSettings } from "metabase-types/api";

import { HEATMAP_SETTING_KEYS } from "./constants";

export type HeatmapColumnNames = {
  row: string | undefined;
  column: string | undefined;
  value: string | undefined;
};

export type HeatmapDisplayOptions = {
  color: string | undefined;
  showValues: boolean;
  showLegend: boolean;
};

/**
 * Reads the names of the row, column and value columns from the settings.
 * Missing or malformed settings come back as `undefined`.
 */
export function getHeatmapColumnNames(
  settings: VisualizationSettings,
): HeatmapColumnNames {
  return {
    row: readString(settings, HEATMAP_SETTING_KEYS.rows),
    column: readString(settings, HEATMAP_SETTING_KEYS.columns),
    value: readString(settings, HEATMAP_SETTING_KEYS.value),
  };
}

/**
 * Reads the display settings, falling back to showing values and the legend.
 */
export function getHeatmapDisplayOptions(
  settings: VisualizationSettings,
): HeatmapDisplayOptions {
  return {
    color: readString(settings, HEATMAP_SETTING_KEYS.color),
    showValues: readBoolean(settings, HEATMAP_SETTING_KEYS.showValues) ?? true,
    showLegend: readBoolean(settings, HEATMAP_SETTING_KEYS.showLegend) ?? true,
  };
}

function readString(
  settings: VisualizationSettings,
  key: string,
): string | undefined {
  const value: unknown = settings[key];
  return typeof value === "string" ? value : undefined;
}

function readBoolean(
  settings: VisualizationSettings,
  key: string,
): boolean | undefined {
  const value: unknown = settings[key];
  return typeof value === "boolean" ? value : undefined;
}
