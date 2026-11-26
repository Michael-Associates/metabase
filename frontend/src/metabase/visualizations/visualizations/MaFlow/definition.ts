import { t } from "ttag";

import {
  ChartSettingsError,
  type ComputedVisualizationSettings,
  type VisualizationDefinition,
  type VisualizationSettingsDefinitions,
  columnSettings,
  getOptionFromColumn,
  metricSetting,
} from "metabase/viz-core";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, DatasetData, RawSeries } from "metabase-types/api";

import { readStringSetting } from "../MaShared/settings";

import {
  FLOW_SETTING_KEYS,
  MAX_FLOW_LINKS,
  MAX_FLOW_NODES,
  MAX_FLOW_STEPS,
} from "./constants";
import { getFlowColumns, getFlowSize } from "./model";
import { getFlowColumnNames, getSavedStepSlots } from "./settings";

/**
 * The steps a new flow chart starts with: every grouping column, in query
 * order. When a SQL result has only numbers, every column but the one that
 * becomes the size of each journey.
 */
export function getDefaultFlowSteps(cols: DatasetColumn[]): string[] {
  const groupings = cols.filter((col) => isDimension(col) && !isMetric(col));
  if (groupings.length >= 2) {
    return groupings.slice(0, MAX_FLOW_STEPS).map((col) => col.name);
  }
  const value = getDefaultFlowValue(cols, []);
  return cols
    .filter((col) => isDimension(col) && col.name !== value)
    .slice(0, MAX_FLOW_STEPS)
    .map((col) => col.name);
}

/**
 * The size of each journey a new flow chart starts with: the first summary
 * the query builder made, or else the last number column, where SQL queries
 * usually put their count. Never one of the steps.
 */
export function getDefaultFlowValue(
  cols: DatasetColumn[],
  stepNames: string[],
): string | undefined {
  const candidates = cols.filter(
    (col) => isMetric(col) && !stepNames.includes(col.name),
  );
  const aggregation = candidates.find((col) => col.source === "aggregation");
  return (aggregation ?? candidates[candidates.length - 1])?.name;
}

type ColumnOption = {
  name: string;
  value: string;
};

export type FlowStepsProps = {
  options: ColumnOption[];
  addAnother: string | null;
  columns: DatasetColumn[];
  showColumnSetting: boolean;
};

/**
 * What the steps picker offers: every grouping column but the size column,
 * and another step while there are columns left and no slot is empty.
 */
export function getFlowStepsProps(
  [{ data }]: RawSeries,
  settings: ComputedVisualizationSettings,
): FlowStepsProps {
  const { value } = getFlowColumnNames(settings);
  const options = data.cols
    .filter((col) => isDimension(col) && col.name !== value)
    .map(getOptionFromColumn);
  const { count, areAllChosen } = getSavedStepSlots(settings);
  return {
    options,
    addAnother:
      options.length > count && count < MAX_FLOW_STEPS && areAllChosen
        ? t`Add a step`
        : null,
    columns: data.cols,
    showColumnSetting: true,
  };
}

export type FlowValueProps = {
  options: ColumnOption[];
  columns: DatasetColumn[];
  showColumnSetting: boolean;
  autoOpenWhenUnset: boolean;
};

/**
 * What the size picker offers: every number column that isn't a step.
 */
export function getFlowValueProps(
  [{ data }]: RawSeries,
  settings: ComputedVisualizationSettings,
): FlowValueProps {
  const { steps } = getFlowColumnNames(settings);
  return {
    options: data.cols
      .filter((col) => isMetric(col) && !steps.includes(col.name))
      .map(getOptionFromColumn),
    columns: data.cols,
    showColumnSetting: true,
    autoOpenWhenUnset: false,
  };
}

const FLOW_SETTINGS: VisualizationSettingsDefinitions = {
  ...columnSettings({ getHidden: () => true }),
  [FLOW_SETTING_KEYS.steps]: {
    getSection: () => t`Data`,
    get title() {
      return t`Steps`;
    },
    widget: "fields",
    persistDefault: true,
    dashboard: false,
    useRawSeries: true,
    getDefault: ([{ data }]: RawSeries) => getDefaultFlowSteps(data.cols),
    isValid: (
      [{ data }]: RawSeries,
      settings: ComputedVisualizationSettings,
    ) => {
      const saved: unknown = settings[FLOW_SETTING_KEYS.steps];
      if (!Array.isArray(saved)) {
        return false;
      }
      const slots: unknown[] = saved;
      const groupingNames = data.cols
        .filter(isDimension)
        .map((col) => col.name);
      return slots.every(
        (slot) =>
          slot == null ||
          (typeof slot === "string" && groupingNames.includes(slot)),
      );
    },
    getProps: getFlowStepsProps,
  },
  ...metricSetting(FLOW_SETTING_KEYS.value, {
    getSection: () => t`Data`,
    get title() {
      return t`Size of each journey`;
    },
    persistDefault: true,
    dashboard: false,
    getDefault: ([{ data }], settings) =>
      getDefaultFlowValue(data.cols, getFlowColumnNames(settings).steps),
    getProps: getFlowValueProps,
    readDependencies: [FLOW_SETTING_KEYS.steps],
  }),
  [FLOW_SETTING_KEYS.colorBy]: {
    getSection: () => t`Display`,
    get title() {
      return t`Color the bands by`;
    },
    widget: "select",
    getDefault: (_series: RawSeries, settings: ComputedVisualizationSettings) =>
      getFlowColumnNames(settings).steps[0],
    isValid: (_series: RawSeries, settings: ComputedVisualizationSettings) => {
      const saved = readStringSetting(settings, FLOW_SETTING_KEYS.colorBy);
      return (
        saved != null && getFlowColumnNames(settings).steps.includes(saved)
      );
    },
    getProps: (
      [{ data }]: RawSeries,
      settings: ComputedVisualizationSettings,
    ) => ({
      options: getFlowColumnNames(settings).steps.map((name) => ({
        name: data.cols.find((col) => col.name === name)?.display_name ?? name,
        value: name,
      })),
    }),
    readDependencies: [FLOW_SETTING_KEYS.steps],
  },
  [FLOW_SETTING_KEYS.nodeOrder]: {
    getSection: () => t`Display`,
    get title() {
      return t`Order of each step`;
    },
    widget: "radio",
    getDefault: () => "size",
    getProps: () => ({
      options: [
        { name: t`Largest first`, value: "size" },
        { name: t`As the query returns it`, value: "query" },
      ],
    }),
  },
  [FLOW_SETTING_KEYS.showValues]: {
    getSection: () => t`Display`,
    get title() {
      return t`Show counts and shares`;
    },
    widget: "toggle",
    inline: true,
    getDefault: () => true,
  },
  [FLOW_SETTING_KEYS.showLegend]: {
    getSection: () => t`Display`,
    get title() {
      return t`Show legend`;
    },
    widget: "toggle",
    inline: true,
    getDefault: () => true,
  },
};

export const MA_FLOW_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Flow`,
  identifier: "ma_flow",
  iconName: "arrow_split",
  get noun() {
    return t`flow chart`;
  },
  minSize: { width: 8, height: 5 },
  defaultSize: { width: 24, height: 10 },
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

    const names = getFlowColumnNames(settings);
    if (names.value != null && names.steps.includes(names.value)) {
      throw new ChartSettingsError(
        t`The size of each journey can't also be a step. Pick a different column for one of them.`,
        { section: t`Data` },
        t`Choose columns`,
      );
    }

    const columns = getFlowColumns(data.cols, names);
    if (columns == null) {
      throw new ChartSettingsError(
        t`Pick at least two different steps and a number for the size of each journey.`,
        { section: t`Data` },
        t`Choose columns`,
      );
    }

    const { nodeCount, linkCount, hasValues } = getFlowSize(data.rows, columns);
    if (nodeCount > MAX_FLOW_NODES || linkCount > MAX_FLOW_LINKS) {
      throw new ChartSettingsError(
        t`A flow chart can show up to ${MAX_FLOW_NODES} boxes and ${MAX_FLOW_LINKS} bands, and this one would need ${nodeCount} and ${linkCount}. Filter the data or group it into fewer values.`,
      );
    }
    if (!hasValues) {
      throw new ChartSettingsError(
        t`The size column has no positive numbers to draw.`,
        { section: t`Data` },
        t`Choose columns`,
      );
    }
  },
  settings: FLOW_SETTINGS,
};
