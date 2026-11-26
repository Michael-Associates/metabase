import { type MeasureText, truncateLabel } from "../MaShared/text";

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
const ROW_LABEL_SPACING = 2;
const ROTATED_LABEL_SPACING = 1.4;
const SIN_45 = Math.SQRT1_2;
const WIDE_GAP_MIN_CELL_SIZE = 14;
const NARROW_GAP_MIN_CELL_SIZE = 6;
const MAX_CELL_RADIUS = 4;
const CELL_RADIUS_RATIO = 0.18;

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
  const columnCount = Math.max(1, columnLabels.length);
  const rowLabelWidth = Math.min(
    getWidestLabelWidth(rowLabels, measureText),
    width * MAX_ROW_LABEL_SHARE,
  );
  const axisOptions = { labels: columnLabels, height, fontSize, measureText };

  let plotX = OUTER_PADDING + rowLabelWidth + LABEL_GAP;
  let cellWidth = getCellWidth(width, plotX, columnCount);
  let columnAxis = getColumnAxis({ ...axisOptions, cellWidth });

  const rotatedLabelsX = OUTER_PADDING + columnAxis.labelReach - cellWidth / 2;
  if (columnAxis.isRotated && rotatedLabelsX > plotX) {
    plotX = rotatedLabelsX;
    cellWidth = getCellWidth(width, plotX, columnCount);
    columnAxis = getColumnAxis({ ...axisOptions, cellWidth });
  }

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
    plotWidth: cellWidth * columnCount,
    plotHeight,
    cellWidth,
    cellHeight,
    cellGap: getCellGap(smallestSide),
    cellRadius: Math.min(MAX_CELL_RADIUS, smallestSide * CELL_RADIUS_RATIO),
    rowLabels: rowLabels.map((label) =>
      truncateLabel(label, rowLabelWidth, measureText),
    ),
    rowLabelStep: getLabelStep(fontSize + ROW_LABEL_SPACING, cellHeight),
    columnLabels: columnAxis.labels,
    columnLabelStep: columnAxis.step,
    areColumnLabelsRotated: columnAxis.isRotated,
  };
}

function getCellWidth(width: number, plotX: number, columnCount: number) {
  return Math.max(0, width - plotX - OUTER_PADDING) / columnCount;
}

function getCellGap(smallestSide: number) {
  if (smallestSide >= WIDE_GAP_MIN_CELL_SIZE) {
    return 2;
  }
  if (smallestSide >= NARROW_GAP_MIN_CELL_SIZE) {
    return 1;
  }
  return 0;
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
  labelReach: number;
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
      labelReach: 0,
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
    labelReach: maxLabelWidth * SIN_45,
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
