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

import { isValidColor } from "./colors";
import { HEATMAP_SETTING_KEYS, MAX_HEATMAP_CELLS } from "./constants";
import { getHeatmapColumns, getHeatmapSize } from "./model";
import { getHeatmapColumnNames, getHeatmapDisplayOptions } from "./settings";

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
    getProps: ([{ data }], settings) => {
      const rowsName = getHeatmapColumnNames(settings).row;
      return {
        options: data.cols
          .filter((col) => isDimension(col) && col.name !== rowsName)
          .map((col) => ({ name: col.display_name, value: col.name })),
        columns: data.cols,
        showColumnSetting: true,
      };
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
    isValid: ([{ card }]) =>
      isValidColor(getHeatmapDisplayOptions(card.visualization_settings).color),
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
    cols.length >= 3 &&
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

    const columns = getHeatmapColumns(
      data.cols,
      getHeatmapColumnNames(settings),
    );
    if (columns == null) {
      throw new ChartSettingsError(
        t`Pick a column for the rows, another for the columns, and a number for the cell values.`,
        { section: t`Data` },
        t`Choose columns`,
      );
    }

    const { rowCount, columnCount, hasValues } = getHeatmapSize(
      data.rows,
      columns,
    );
    const cellCount = rowCount * columnCount;
    if (cellCount > MAX_HEATMAP_CELLS) {
      throw new ChartSettingsError(
        t`A heatmap can show up to ${MAX_HEATMAP_CELLS} cells, and this one would need ${cellCount}. Filter the data or group it into fewer values.`,
      );
    }
    if (!hasValues) {
      throw new ChartSettingsError(
        t`The value column has no numbers to color the cells with.`,
        { section: t`Data` },
        t`Choose columns`,
      );
    }
  },
  settings: HEATMAP_SETTINGS,
};
