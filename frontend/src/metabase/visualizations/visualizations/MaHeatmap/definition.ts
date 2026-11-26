import { t } from "ttag";

import { color } from "metabase/ui/colors";
import {
  ChartSettingsError,
  type ComputedVisualizationSettings,
  type VisualizationDefinition,
  type VisualizationSettingsDefinitions,
  columnSettings,
  dimensionSetting,
  metricSetting,
} from "metabase/viz-core";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData, RawSeries } from "metabase-types/api";

import { HEATMAP_SETTING_KEYS } from "./constants";
import { getHeatmapColumns } from "./model";
import { getHeatmapColumnNames } from "./settings";

const HEATMAP_SETTINGS: VisualizationSettingsDefinitions = {
  ...columnSettings({ getHidden: () => true }),
  ...dimensionSetting(HEATMAP_SETTING_KEYS.rows, {
    getSection: () => t`Data`,
    get title() {
      return t`Rows`;
    },
    showColumnSetting: true,
    persistDefault: true,
    dashboard: false,
    autoOpenWhenUnset: false,
    getDefault: ([{ data }]) =>
      data.cols.find((col) => isDimension(col) && !isMetric(col))?.name ??
      data.cols.find(isDimension)?.name,
  }),
  ...dimensionSetting(HEATMAP_SETTING_KEYS.columns, {
    getSection: () => t`Data`,
    get title() {
      return t`Columns`;
    },
    showColumnSetting: true,
    persistDefault: true,
    dashboard: false,
    autoOpenWhenUnset: false,
    getDefault: ([{ data }], settings) => {
      const rowsName = getHeatmapColumnNames(settings).row;
      const otherDimensions = data.cols.filter(
        (col) => isDimension(col) && col.name !== rowsName,
      );
      return (
        otherDimensions.find((col) => !isMetric(col))?.name ??
        otherDimensions[0]?.name
      );
    },
    readDependencies: [HEATMAP_SETTING_KEYS.rows],
  }),
  ...metricSetting(HEATMAP_SETTING_KEYS.value, {
    getSection: () => t`Data`,
    get title() {
      return t`Value`;
    },
    showColumnSetting: true,
    persistDefault: true,
    dashboard: false,
    autoOpenWhenUnset: false,
    getDefault: ([{ data }], settings) => {
      const { row, column } = getHeatmapColumnNames(settings);
      return data.cols.find(
        (col) => isMetric(col) && col.name !== row && col.name !== column,
      )?.name;
    },
    readDependencies: [HEATMAP_SETTING_KEYS.rows, HEATMAP_SETTING_KEYS.columns],
  }),
  [HEATMAP_SETTING_KEYS.color]: {
    getSection: () => t`Display`,
    get title() {
      return t`Color`;
    },
    widget: "color",
    getDefault: () => color("brand"),
  },
  [HEATMAP_SETTING_KEYS.showValues]: {
    getSection: () => t`Display`,
    get title() {
      return t`Show values in cells`;
    },
    widget: "toggle",
    inline: true,
    getDefault: () => true,
  },
  [HEATMAP_SETTING_KEYS.showLegend]: {
    getSection: () => t`Display`,
    get title() {
      return t`Show legend`;
    },
    widget: "toggle",
    inline: true,
    getDefault: () => true,
  },
};

export const MA_HEATMAP_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Heatmap`,
  identifier: "ma_heatmap",
  iconName: "grid",
  get noun() {
    return t`heatmap`;
  },
  minSize: { width: 6, height: 4 },
  defaultSize: { width: 12, height: 8 },
  disableVisualizer: true,
  hasEmptyState: true,
  isSensible: ({ cols, rows }: DatasetData) =>
    rows.length >= 1 &&
    cols.filter(isDimension).length >= 2 &&
    cols.some(isMetric),
  checkRenderable: (
    series: RawSeries,
    settings: ComputedVisualizationSettings,
  ) => {
    const [{ data }] = series;
    if (data.rows.length === 0) {
      return;
    }
    if (!getHeatmapColumns(data.cols, getHeatmapColumnNames(settings))) {
      throw new ChartSettingsError(
        t`Pick a column for the rows, another for the columns, and a number for the cell values.`,
        { section: t`Data` },
        t`Choose columns`,
      );
    }
  },
  settings: HEATMAP_SETTINGS,
};
