import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

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

export type HeatmapAxisItem = {
  key: string;
  value: RowValue;
};

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

type AxisSortOptions = {
  isTemporal: boolean;
  sortsText: boolean;
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

function getAxisKey(value: RowValue): string {
  return value !== null && typeof value === "object"
    ? `object:${JSON.stringify(value)}`
    : `${typeof value}:${String(value)}`;
}

function getAxisItem(value: RowValue): HeatmapAxisItem {
  return { key: getAxisKey(value), value };
}

function getCellKey(rowKey: string, columnKey: string) {
  return JSON.stringify([rowKey, columnKey]);
}

function getAxisSortOptions(column: DatasetColumn): AxisSortOptions {
  return {
    isTemporal: isDate(column),
    sortsText: column.source === "breakout",
  };
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

type SortableAxisItem<T> = {
  item: HeatmapAxisItem;
  sortValue: T;
};

/**
 * Orders axis items: numbers and dates ascending, text alphabetically when
 * `sortsText` is set, anything else in the order given. Empty values go last.
 */
export function sortAxisItems(
  items: HeatmapAxisItem[],
  { isTemporal, sortsText }: AxisSortOptions,
): HeatmapAxisItem[] {
  const presentItems = items.filter((item) => item.value !== null);
  const emptyItems = items.filter((item) => item.value === null);
  const sortedItems =
    sortByNumber(presentItems, isTemporal) ??
    (sortsText ? sortByText(presentItems) : null) ??
    presentItems;
  return [...sortedItems, ...emptyItems];
}

function sortByNumber(
  items: HeatmapAxisItem[],
  isTemporal: boolean,
): HeatmapAxisItem[] | null {
  const sortableItems: SortableAxisItem<number>[] = [];
  for (const item of items) {
    const sortValue = getNumericSortValue(item.value, isTemporal);
    if (sortValue == null) {
      return null;
    }
    sortableItems.push({ item, sortValue });
  }
  return sortableItems
    .sort((left, right) => left.sortValue - right.sortValue)
    .map(({ item }) => item);
}

function sortByText(items: HeatmapAxisItem[]): HeatmapAxisItem[] | null {
  const sortableItems: SortableAxisItem<string>[] = [];
  for (const item of items) {
    if (typeof item.value !== "string") {
      return null;
    }
    sortableItems.push({ item, sortValue: item.value });
  }
  return sortableItems
    .sort((left, right) => left.sortValue.localeCompare(right.sortValue))
    .map(({ item }) => item);
}

function getNumericSortValue(
  value: RowValue,
  isTemporal: boolean,
): number | null {
  if (typeof value === "number") {
    return value;
  }
  if (isTemporal && typeof value === "string") {
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
  }
  return null;
}
