import type { DatasetColumn } from "metabase-types/api";

export type ChartColumn = {
  column: DatasetColumn;
  index: number;
};

/**
 * Finds a result column by name, with its position in each row.
 * Returns `null` when the name is unset or isn't in the result.
 */
export function findChartColumn(
  cols: DatasetColumn[],
  name: string | undefined,
): ChartColumn | null {
  if (name == null) {
    return null;
  }
  const index = cols.findIndex((col) => col.name === name);
  return index >= 0 ? { column: cols[index], index } : null;
}
