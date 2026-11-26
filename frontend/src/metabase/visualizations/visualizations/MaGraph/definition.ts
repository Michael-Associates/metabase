import { t } from "ttag";

import {
  ChartSettingsError,
  type ComputedVisualizationSettings,
  type VisualizationDefinition,
} from "metabase/viz-core";
import type { RawSeries } from "metabase-types/api";

import { MA_GRAPH_SETTING_KEYS } from "./constants";
import { getGraphHtml } from "./graph-data";

/** The name the graph code editor is registered under. */
export const MA_GRAPH_CODE_WIDGET = "maGraphCode";

export const MA_GRAPH_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Custom graph`,
  identifier: "ma_graph",
  iconName: "code_block",
  get noun() {
    return t`custom graph`;
  },
  minSize: { width: 6, height: 4 },
  defaultSize: { width: 24, height: 12 },
  disableVisualizer: true,
  canSavePng: false,
  // A custom graph is chosen on purpose, never suggested for a result.
  isSensible: () => false,
  checkRenderable: (
    _series: RawSeries,
    settings: ComputedVisualizationSettings,
  ) => {
    if (getGraphHtml(settings) == null) {
      throw new ChartSettingsError(
        t`Add the graph's code: an HTML page that draws the results.`,
        { section: t`Graph` },
        t`Add code`,
      );
    }
  },
  settings: {
    [MA_GRAPH_SETTING_KEYS.html]: {
      getSection: () => t`Graph`,
      get title() {
        return t`Graph code (HTML)`;
      },
      widget: MA_GRAPH_CODE_WIDGET,
      // A dashboard card can't swap a graph's code: only the card holds it.
      dashboard: false,
    },
  },
};
