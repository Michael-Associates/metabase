import { formatValue } from "metabase/value-formatting";
import type { ComputedVisualizationSettings } from "metabase/viz-core";
import type { DatasetColumn, RowValue } from "metabase-types/api";

/**
 * Formats a grouping value the way Metabase shows it, as plain text.
 */
export function formatDimension(
  value: RowValue,
  column: DatasetColumn,
  settings: ComputedVisualizationSettings,
): string {
  return String(
    formatValue(value, {
      ...settings.column?.(column),
      jsx: false,
      stringifyNull: true,
      majorWidth: 0,
    }),
  );
}

/**
 * Formats a number with its column's formatting, as plain text.
 */
export function formatMetric(
  value: number,
  column: DatasetColumn,
  settings: ComputedVisualizationSettings,
  { compact }: { compact: boolean },
): string {
  return String(
    formatValue(value, {
      ...settings.column?.(column),
      jsx: false,
      compact,
    }),
  );
}

/**
 * Formats a ratio such as 0.4213 as "42.1%".
 */
export function formatShare(ratio: number): string {
  return String(
    formatValue(ratio, {
      number_style: "percent",
      decimals: 1,
      jsx: false,
    }),
  );
}
