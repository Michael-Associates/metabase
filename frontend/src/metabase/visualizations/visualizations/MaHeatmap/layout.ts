export type MeasureText = (text: string) => number;

export type HeatmapLayoutOptions = {
  width: number;
  height: number;
  rowLabels: string[];
  columnLabels: string[];
  fontSize: number;
  measureText: MeasureText;
};

export type HeatmapLayout = {
  plotX: number;
  plotY: number;
  plotWidth: number;
  plotHeight: number;
  cellWidth: number;
  cellHeight: number;
  cellGap: number;
  cellRadius: number;
  rowLabels: string[];
  rowLabelStep: number;
  columnLabels: string[];
  columnLabelStep: number;
  areColumnLabelsRotated: boolean;
};

export const LABEL_GAP = 8;

const OUTER_PADDING = 8;
const MAX_ROW_LABEL_SHARE = 0.3;
const MAX_COLUMN_LABEL_SHARE = 0.3;
const LABEL_PADDING = 6;
const ROTATED_LABEL_SPACING = 1.4;
const SIN_45 = Math.SQRT1_2;
const ELLIPSIS = "…";

/**
 * Splits the available space into the row labels on the left, the column
 * labels underneath and the grid of cells. Labels that don't fit are
 * shortened with an ellipsis, column labels are turned 45 degrees when they
 * can't sit side by side, and only every n-th label is shown when the cells
 * are too small for all of them.
 */
export function getHeatmapLayout({
  width,
  height,
  rowLabels,
  columnLabels,
  fontSize,
  measureText,
}: HeatmapLayoutOptions): HeatmapLayout {
  const rowLabelWidth = Math.min(
    getWidestLabelWidth(rowLabels, measureText),
    width * MAX_ROW_LABEL_SHARE,
  );
  const plotX = OUTER_PADDING + rowLabelWidth + LABEL_GAP;
  const plotWidth = Math.max(0, width - plotX - OUTER_PADDING);
  const cellWidth = plotWidth / Math.max(1, columnLabels.length);

  const columnAxis = getColumnAxis({
    labels: columnLabels,
    cellWidth,
    height,
    fontSize,
    measureText,
  });

  const plotY = OUTER_PADDING;
  const plotHeight = Math.max(
    0,
    height - plotY - columnAxis.height - OUTER_PADDING,
  );
  const cellHeight = plotHeight / Math.max(1, rowLabels.length);
  const smallestSide = Math.min(cellWidth, cellHeight);

  return {
    plotX,
    plotY,
    plotWidth,
    plotHeight,
    cellWidth,
    cellHeight,
    cellGap: smallestSide >= 14 ? 2 : smallestSide >= 6 ? 1 : 0,
    cellRadius: Math.min(4, smallestSide * 0.18),
    rowLabels: rowLabels.map((label) =>
      truncateLabel(label, rowLabelWidth, measureText),
    ),
    rowLabelStep: getLabelStep(fontSize + 2, cellHeight),
    columnLabels: columnAxis.labels,
    columnLabelStep: columnAxis.step,
    areColumnLabelsRotated: columnAxis.isRotated,
  };
}

type ColumnAxisOptions = {
  labels: string[];
  cellWidth: number;
  height: number;
  fontSize: number;
  measureText: MeasureText;
};

type ColumnAxis = {
  labels: string[];
  height: number;
  step: number;
  isRotated: boolean;
};

function getColumnAxis({
  labels,
  cellWidth,
  height,
  fontSize,
  measureText,
}: ColumnAxisOptions): ColumnAxis {
  const widestLabelWidth = getWidestLabelWidth(labels, measureText);

  if (widestLabelWidth + LABEL_PADDING <= cellWidth) {
    return {
      labels,
      height: fontSize + LABEL_GAP,
      step: 1,
      isRotated: false,
    };
  }

  const maxLabelWidth = Math.min(
    widestLabelWidth,
    (height * MAX_COLUMN_LABEL_SHARE) / SIN_45,
  );
  return {
    labels: labels.map((label) =>
      truncateLabel(label, maxLabelWidth, measureText),
    ),
    height: maxLabelWidth * SIN_45 + fontSize * SIN_45 + LABEL_GAP,
    step: getLabelStep(fontSize * ROTATED_LABEL_SPACING, cellWidth),
    isRotated: true,
  };
}

function getWidestLabelWidth(labels: string[], measureText: MeasureText) {
  return labels.reduce(
    (widest, label) => Math.max(widest, measureText(label)),
    0,
  );
}

function getLabelStep(spaceNeeded: number, spacePerCell: number) {
  if (spacePerCell <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(spaceNeeded / spacePerCell));
}

/**
 * Shortens a label with an ellipsis so it fits within `maxWidth`.
 */
export function truncateLabel(
  label: string,
  maxWidth: number,
  measureText: MeasureText,
): string {
  if (measureText(label) <= maxWidth) {
    return label;
  }

  let low = 0;
  let high = label.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = label.slice(0, middle) + ELLIPSIS;
    if (measureText(candidate) <= maxWidth) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return low > 0 ? label.slice(0, low) + ELLIPSIS : "";
}
