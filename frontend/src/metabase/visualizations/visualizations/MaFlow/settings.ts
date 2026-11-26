import type { VisualizationSettings } from "metabase-types/api";

import {
  readBooleanSetting,
  readStringListSetting,
  readStringSetting,
} from "../MaShared/settings";

import {
  FLOW_NODE_ORDERS,
  FLOW_SETTING_KEYS,
  type FlowNodeOrder,
} from "./constants";

export type FlowColumnNames = {
  steps: string[];
  value: string | undefined;
  colorBy: string | undefined;
};

export type FlowDisplayOptions = {
  nodeOrder: FlowNodeOrder;
  showValues: boolean;
  showLegend: boolean;
};

/**
 * Reads the step, value and color-by column names from the settings.
 * Unset steps are left out; a missing value or color-by comes back as
 * `undefined`.
 */
export function getFlowColumnNames(
  settings: VisualizationSettings,
): FlowColumnNames {
  return {
    steps: readStringListSetting(settings, FLOW_SETTING_KEYS.steps),
    value: readStringSetting(settings, FLOW_SETTING_KEYS.value),
    colorBy: readStringSetting(settings, FLOW_SETTING_KEYS.colorBy),
  };
}

/**
 * Reads the display settings: largest nodes first, values and legend shown,
 * unless the settings say otherwise.
 */
export function getFlowDisplayOptions(
  settings: VisualizationSettings,
): FlowDisplayOptions {
  const nodeOrder = readStringSetting(settings, FLOW_SETTING_KEYS.nodeOrder);
  return {
    nodeOrder: FLOW_NODE_ORDERS.find((order) => order === nodeOrder) ?? "size",
    showValues:
      readBooleanSetting(settings, FLOW_SETTING_KEYS.showValues) ?? true,
    showLegend:
      readBooleanSetting(settings, FLOW_SETTING_KEYS.showLegend) ?? true,
  };
}

/**
 * Describes the steps list as saved, including the empty slot the picker adds
 * while someone is choosing a new step.
 */
export function getSavedStepSlots(settings: VisualizationSettings): {
  count: number;
  areAllChosen: boolean;
} {
  const value: unknown = settings[FLOW_SETTING_KEYS.steps];
  if (!Array.isArray(value)) {
    return { count: 0, areAllChosen: true };
  }
  const slots: unknown[] = value;
  return {
    count: slots.length,
    areAllChosen: slots.every((slot) => typeof slot === "string"),
  };
}
