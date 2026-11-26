import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, RowValue } from "metabase-types/api";

export type AxisItem = {
  key: string;
  value: RowValue;
};

export type AxisSortOptions = {
  isTemporal: boolean;
  sortsText: boolean;
};

/**
 * A stable identity for a cell value, so values that only differ by type
 * (`1` and `"1"`) stay apart.
 */
export function getAxisKey(value: RowValue): string {
  return value !== null && typeof value === "object"
    ? `object:${JSON.stringify(value)}`
    : `${typeof value}:${String(value)}`;
}

export function getAxisItem(value: RowValue): AxisItem {
  return { key: getAxisKey(value), value };
}

/**
 * Date columns sort chronologically; text grouped by the query builder sorts
 * alphabetically, like Metabase sorts the query.
 */
export function getAxisSortOptions(column: DatasetColumn): AxisSortOptions {
  return {
    isTemporal: isDate(column),
    sortsText: column.source === "breakout",
  };
}

/**
 * Orders axis items: numbers and dates ascending, text alphabetically when
 * `sortsText` is set, anything else in the order given. Empty values go last.
 */
export function sortAxisItems<T extends AxisItem>(
  items: T[],
  { isTemporal, sortsText }: AxisSortOptions,
): T[] {
  const presentItems = items.filter((item) => item.value !== null);
  const emptyItems = items.filter((item) => item.value === null);
  const sortedItems =
    sortByNumber(presentItems, isTemporal) ??
    (sortsText ? sortByText(presentItems) : null) ??
    presentItems;
  return [...sortedItems, ...emptyItems];
}

function sortByNumber<T extends AxisItem>(
  items: T[],
  isTemporal: boolean,
): T[] | null {
  const sortableItems: { item: T; sortValue: number }[] = [];
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

function sortByText<T extends AxisItem>(items: T[]): T[] | null {
  const sortableItems: { item: T; sortValue: string }[] = [];
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
