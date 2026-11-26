import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import {
  type AxisItem,
  getAxisItem,
  getAxisKey,
  getAxisSortOptions,
  sortAxisItems,
} from "../MaShared/axis";

import type { HeatmapColumnNames } from "./settings";

export type HeatmapColumn = {
  column: DatasetColumn;
  index: number;
};

export type HeatmapColumns = {
  row: HeatmapColumn;
  column: HeatmapColumn;
  value: HeatmapColumn;
};

export type HeatmapAxisItem = AxisItem;

export type HeatmapCell = {
  value: number;
  sourceRow: RowValues;
};

export type HeatmapModel = {
  rowItems: HeatmapAxisItem[];
  columnItems: HeatmapAxisItem[];
  cells: (HeatmapCell | null)[][];
  valueExtent: [number, number] | null;
  emptyCellCount: number;
  duplicateCount: number;
};

export type HeatmapSize = {
  rowCount: number;
  columnCount: number;
  hasValues: boolean;
};

/**
 * Resolves the row, column and value columns of a heatmap.
 * Returns `null` when any of them is unset, missing from the result, or when
 * rows and columns point to the same column.
 */
export function getHeatmapColumns(
  cols: DatasetColumn[],
  names: HeatmapColumnNames,
): HeatmapColumns | null {
  const row = findColumn(cols, names.row);
  const column = findColumn(cols, names.column);
  const value = findColumn(cols, names.value);

  if (row == null || column == null || value == null) {
    return null;
  }
  if (row.index === column.index) {
    return null;
  }

  return { row, column, value };
}

function findColumn(
  cols: DatasetColumn[],
  name: string | undefined,
): HeatmapColumn | null {
  if (name == null) {
    return null;
  }
  const index = cols.findIndex((col) => col.name === name);
  return index >= 0 ? { column: cols[index], index } : null;
}

/**
 * Counts the distinct rows and columns the grid would have, and whether any
 * cell would have a number to color it with.
 */
export function getHeatmapSize(
  rows: RowValues[],
  columns: HeatmapColumns,
): HeatmapSize {
  const rowKeys = new Set<string>();
  const columnKeys = new Set<string>();
  let hasValues = false;

  for (const row of rows) {
    rowKeys.add(getAxisKey(row[columns.row.index]));
    columnKeys.add(getAxisKey(row[columns.column.index]));
    hasValues = hasValues || isCellValue(row[columns.value.index]);
  }

  return {
    rowCount: rowKeys.size,
    columnCount: columnKeys.size,
    hasValues,
  };
}

/**
 * Builds the grid a heatmap draws: one axis item per distinct row and column
 * value, and one cell per combination that has a numeric value.
 *
 * Number and date axes are sorted ascending. Text axes grouped by the query
 * builder are sorted alphabetically, like Metabase sorts the query; other text
 * axes keep the order the query returned. Empty values go last. When a
 * combination appears more than once, the first value wins and
 * `duplicateCount` reports the rest.
 */
export function getHeatmapModel(
  rows: RowValues[],
  columns: HeatmapColumns,
): HeatmapModel {
  const rowItemsByKey = new Map<string, HeatmapAxisItem>();
  const columnItemsByKey = new Map<string, HeatmapAxisItem>();
  const cellsByKey = new Map<string, HeatmapCell>();
  let duplicateCount = 0;

  for (const row of rows) {
    const rowItem = getAxisItem(row[columns.row.index]);
    const columnItem = getAxisItem(row[columns.column.index]);
    const value = row[columns.value.index];

    if (!rowItemsByKey.has(rowItem.key)) {
      rowItemsByKey.set(rowItem.key, rowItem);
    }
    if (!columnItemsByKey.has(columnItem.key)) {
      columnItemsByKey.set(columnItem.key, columnItem);
    }
    if (!isCellValue(value)) {
      continue;
    }

    const cellKey = getCellKey(rowItem.key, columnItem.key);
    if (cellsByKey.has(cellKey)) {
      duplicateCount += 1;
      continue;
    }
    cellsByKey.set(cellKey, { value, sourceRow: row });
  }

  const rowItems = sortAxisItems(
    Array.from(rowItemsByKey.values()),
    getAxisSortOptions(columns.row.column),
  );
  const columnItems = sortAxisItems(
    Array.from(columnItemsByKey.values()),
    getAxisSortOptions(columns.column.column),
  );
  const cells = rowItems.map((rowItem) =>
    columnItems.map(
      (columnItem) =>
        cellsByKey.get(getCellKey(rowItem.key, columnItem.key)) ?? null,
    ),
  );

  return {
    rowItems,
    columnItems,
    cells,
    valueExtent: getValueExtent(cellsByKey.values()),
    emptyCellCount: rowItems.length * columnItems.length - cellsByKey.size,
    duplicateCount,
  };
}

function isCellValue(value: RowValue): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getCellKey(rowKey: string, columnKey: string) {
  return JSON.stringify([rowKey, columnKey]);
}

function getValueExtent(cells: Iterable<HeatmapCell>): [number, number] | null {
  let extent: [number, number] | null = null;
  for (const { value } of cells) {
    extent =
      extent == null
        ? [value, value]
        : [Math.min(extent[0], value), Math.max(extent[1], value)];
  }
  return extent;
}
