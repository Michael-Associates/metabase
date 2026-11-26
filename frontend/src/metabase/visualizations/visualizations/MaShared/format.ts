import { formatNumber } from "metabase/utils/formatting";
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

const SMALLEST_SHOWN_SHARE = 0.001;

/**
 * Formats a ratio such as 0.4213 as "42.1%", with the given number
 * separators. A share too small to show at one decimal reads "<0.1%" rather
 * than "0%".
 */
export function formatShare(
  ratio: number,
  { numberSeparators }: { numberSeparators?: string } = {},
): string {
  const format = (share: number) =>
    formatNumber(share, {
      number_style: "percent",
      maximumFractionDigits: 1,
      number_separators: numberSeparators,
    });
  return ratio > 0 && ratio < SMALLEST_SHOWN_SHARE
    ? `<${format(SMALLEST_SHOWN_SHARE)}`
    : format(ratio);
}
