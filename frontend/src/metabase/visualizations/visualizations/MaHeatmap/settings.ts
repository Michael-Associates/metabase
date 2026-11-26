import type { VisualizationSettings } from "metabase-types/api";

import { readBooleanSetting, readStringSetting } from "../MaShared/settings";

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
    row: readStringSetting(settings, HEATMAP_SETTING_KEYS.rows),
    column: readStringSetting(settings, HEATMAP_SETTING_KEYS.columns),
    value: readStringSetting(settings, HEATMAP_SETTING_KEYS.value),
  };
}

/**
 * Reads the display settings, falling back to showing values and the legend.
 */
export function getHeatmapDisplayOptions(
  settings: VisualizationSettings,
): HeatmapDisplayOptions {
  return {
    color: readStringSetting(settings, HEATMAP_SETTING_KEYS.color),
    showValues:
      readBooleanSetting(settings, HEATMAP_SETTING_KEYS.showValues) ?? true,
    showLegend:
      readBooleanSetting(settings, HEATMAP_SETTING_KEYS.showLegend) ?? true,
  };
}
