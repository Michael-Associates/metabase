import type { DatasetColumn, RowValues } from "metabase-types/api";
import {
  createMockColumn,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

import { getHeatmapColumns, getHeatmapModel, getHeatmapSize } from "./model";

const DAY_COLUMN = createMockNumericColumn({
  name: "day_of_week",
  display_name: "Day of week",
  source: "breakout",
});
const AGENT_COLUMN = createMockColumn({
  name: "agent",
  display_name: "Agent",
  base_type: "type/Text",
  effective_type: "type/Text",
  source: "breakout",
});
const MONTH_COLUMN = createMockColumn({
  name: "month",
  display_name: "Month",
  base_type: "type/DateTime",
  effective_type: "type/DateTime",
  source: "breakout",
});
const COUNT_COLUMN = createMockNumericColumn({
  name: "count",
  display_name: "Count",
  source: "aggregation",
});

const COLS = [DAY_COLUMN, AGENT_COLUMN, COUNT_COLUMN];

interface SetupOpts {
  rows: RowValues[];
  cols?: DatasetColumn[];
  rowName?: string;
  columnName?: string;
}

const setup = ({
  rows,
  cols = COLS,
  rowName = "agent",
  columnName = "day_of_week",
}: SetupOpts) => {
  const columns = getHeatmapColumns(cols, {
    row: rowName,
    column: columnName,
    value: "count",
  });
  if (columns == null) {
    throw new Error("Expected the heatmap columns to resolve");
  }
  return getHeatmapModel(rows, columns);
};

describe("getHeatmapColumns", () => {
  it("resolves the row, column and value columns by name", () => {
    expect(
      getHeatmapColumns(COLS, {
        row: "agent",
        column: "day_of_week",
        value: "count",
      }),
    ).toEqual({
      row: { column: AGENT_COLUMN, index: 1 },
      column: { column: DAY_COLUMN, index: 0 },
      value: { column: COUNT_COLUMN, index: 2 },
    });
  });

  it("returns null when a setting is missing", () => {
    expect(
      getHeatmapColumns(COLS, {
        row: "agent",
        column: undefined,
        value: "count",
      }),
    ).toBeNull();
  });

  it("returns null when a setting points to a column that is not in the result", () => {
    expect(
      getHeatmapColumns(COLS, {
        row: "agent",
        column: "removed_column",
        value: "count",
      }),
    ).toBeNull();
  });

  it("returns null when rows and columns use the same column", () => {
    expect(
      getHeatmapColumns(COLS, {
        row: "agent",
        column: "agent",
        value: "count",
      }),
    ).toBeNull();
  });
});

describe("getHeatmapModel", () => {
  it("sorts numeric axes ascending even when the query returns them out of order", () => {
    const model = setup({
      rows: [
        [3, "Ana", 5],
        [1, "Ana", 7],
        [2, "Ana", 9],
      ],
    });

    expect(model.columnItems.map((item) => item.value)).toEqual([1, 2, 3]);
    expect(model.cells[0].map((cell) => cell?.value)).toEqual([7, 9, 5]);
  });

  it("sorts text axes from the query builder alphabetically, with empty values last", () => {
    const model = setup({
      rows: [
        [1, "Zoe", 1],
        [1, null, 2],
        [1, "Ana", 3],
      ],
    });

    expect(model.rowItems.map((item) => item.value)).toEqual([
      "Ana",
      "Zoe",
      null,
    ]);
  });

  it("keeps text axes from SQL questions in the order the query returned them", () => {
    const model = setup({
      cols: [DAY_COLUMN, { ...AGENT_COLUMN, source: "native" }, COUNT_COLUMN],
      rows: [
        [1, "Zoe", 1],
        [1, null, 2],
        [1, "Ana", 3],
      ],
    });

    expect(model.rowItems.map((item) => item.value)).toEqual([
      "Zoe",
      "Ana",
      null,
    ]);
  });

  it("sorts date axes chronologically", () => {
    const model = setup({
      cols: [MONTH_COLUMN, AGENT_COLUMN, COUNT_COLUMN],
      columnName: "month",
      rows: [
        ["2026-03-01T00:00:00Z", "Ana", 1],
        ["2025-12-01T00:00:00Z", "Ana", 2],
        ["2026-01-01T00:00:00Z", "Ana", 3],
      ],
    });

    expect(model.columnItems.map((item) => item.value)).toEqual([
      "2025-12-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
      "2026-03-01T00:00:00Z",
    ]);
  });

  it("leaves combinations without a numeric value empty and counts them", () => {
    const model = setup({
      rows: [
        [1, "Ana", 4],
        [2, "Bob", 6],
        [2, "Ana", null],
      ],
    });

    expect(model.cells).toEqual([
      [{ value: 4, sourceRow: [1, "Ana", 4] }, null],
      [null, { value: 6, sourceRow: [2, "Bob", 6] }],
    ]);
    expect(model.emptyCellCount).toBe(2);
    expect(model.valueExtent).toEqual([4, 6]);
  });

  it("keeps the first value when a combination repeats and reports the duplicates", () => {
    const model = setup({
      rows: [
        [1, "Ana", 4],
        [1, "Ana", 40],
        [1, "Ana", 400],
      ],
    });

    expect(model.cells[0][0]?.value).toBe(4);
    expect(model.duplicateCount).toBe(2);
  });

  it("tells apart values that only differ by type", () => {
    const model = setup({
      rows: [
        [1, "1", 4],
        [1, 1, 5],
      ],
      cols: [
        DAY_COLUMN,
        createMockColumn({ name: "agent", source: "breakout" }),
        COUNT_COLUMN,
      ],
    });

    expect(model.rowItems).toHaveLength(2);
  });

  it("has no value extent when no cell has a number", () => {
    const model = setup({ rows: [[1, "Ana", null]] });

    expect(model.valueExtent).toBeNull();
  });
});

describe("getHeatmapSize", () => {
  it("counts the distinct rows and columns", () => {
    const columns = getHeatmapColumns(COLS, {
      row: "agent",
      column: "day_of_week",
      value: "count",
    });
    if (columns == null) {
      throw new Error("Expected the heatmap columns to resolve");
    }

    expect(
      getHeatmapSize(
        [
          [1, "Ana", 4],
          [2, "Ana", 5],
          [3, "Bob", null],
        ],
        columns,
      ),
    ).toEqual({ rowCount: 2, columnCount: 3, hasValues: true });
    expect(getHeatmapSize([[1, "Ana", null]], columns)).toEqual({
      rowCount: 1,
      columnCount: 1,
      hasValues: false,
    });
  });
});
