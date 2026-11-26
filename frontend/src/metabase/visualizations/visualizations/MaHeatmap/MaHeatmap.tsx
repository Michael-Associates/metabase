import {
  type MouseEvent as ReactMouseEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { Box, Flex, Text } from "metabase/ui";
import { getTextColorForBackground } from "metabase/ui/colors";
import { assignLazily } from "metabase/utils/merge-lazily";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type {
  ClickObject,
  VisualizationProps,
} from "metabase/visualizations/types";
import {
  type ComputedVisualizationSettings,
  type RenderingContext,
  extractRemappings,
} from "metabase/viz-core";
import type { DatasetColumn } from "metabase-types/api";

import { formatDimension, formatMetric } from "../MaShared/format";
import { useContainerSize } from "../MaShared/use-container-size";

import {
  type HeatmapColorScale,
  getHeatmapColorScale,
  getHeatmapLegendStops,
} from "./colors";
import { HEATMAP_LEGEND_HEIGHT } from "./constants";
import { MA_HEATMAP_DEFINITION } from "./definition";
import { type HeatmapLayout, LABEL_GAP, getHeatmapLayout } from "./layout";
import {
  type HeatmapCell,
  type HeatmapColumns,
  type HeatmapModel,
  getHeatmapColumns,
  getHeatmapModel,
} from "./model";
import { getHeatmapColumnNames, getHeatmapDisplayOptions } from "./settings";

type CellPosition = {
  rowIndex: number;
  columnIndex: number;
};

type CellBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CellView = CellPosition &
  CellBounds & {
    key: string;
    fill: string;
    hasValue: boolean;
    label: string | null;
    labelColor: string;
  };

const AXIS_LABEL_WEIGHT = 400;
const CELL_LABEL_WEIGHT = 700;
const CELL_LABEL_PADDING = 6;
const CELL_LABEL_SPACING = 2;
const HOVER_OUTLINE_WIDTH = 1.5;
const LEGEND_GRADIENT_WIDTH = 96;
const LEGEND_GRADIENT_HEIGHT = 8;
const LEGEND_SWATCH_SIZE = 10;

function MaHeatmapComponent({
  rawSeries,
  settings,
  fontFamily,
  isDashboard,
  className,
  onRender,
  onHoverChange,
  onVisualizationClick,
  visualizationIsClickable,
}: VisualizationProps) {
  const remappedSeries = useMemo(
    () => extractRemappings(rawSeries),
    [rawSeries],
  );
  const [{ data }] = remappedSeries;
  const renderingContext = useBrowserRenderingContext({
    fontFamily,
    isDashboard,
  });

  const columns = useMemo(
    () => getHeatmapColumns(data.cols, getHeatmapColumnNames(settings)),
    [data.cols, settings],
  );
  const model = useMemo(
    () => (columns ? getHeatmapModel(data.rows, columns) : null),
    [data.rows, columns],
  );

  const warnings = useMemo(
    () =>
      model != null && model.duplicateCount > 0
        ? [
            t`Some cells have more than one value. The heatmap shows the first one.`,
          ]
        : [],
    [model],
  );
  useEffect(() => {
    onRender({ warnings });
  }, [onRender, warnings]);

  if (columns == null || model == null || model.valueExtent == null) {
    return null;
  }

  return (
    <HeatmapView
      className={className}
      columns={columns}
      model={model}
      valueExtent={model.valueExtent}
      cols={data.cols}
      settings={settings}
      renderingContext={renderingContext}
      onHoverChange={onHoverChange}
      onVisualizationClick={onVisualizationClick}
      visualizationIsClickable={visualizationIsClickable}
    />
  );
}

type HeatmapViewProps = Pick<
  VisualizationProps,
  | "className"
  | "settings"
  | "onHoverChange"
  | "onVisualizationClick"
  | "visualizationIsClickable"
> & {
  columns: HeatmapColumns;
  model: HeatmapModel;
  valueExtent: [number, number];
  cols: DatasetColumn[];
  renderingContext: RenderingContext;
};

function HeatmapView({
  className,
  columns,
  model,
  valueExtent,
  cols,
  settings,
  renderingContext,
  onHoverChange,
  onVisualizationClick,
  visualizationIsClickable,
}: HeatmapViewProps) {
  const { ref: containerRef, width, height } = useContainerSize();
  const [hoveredCell, setHoveredCell] = useState<CellPosition | null>(null);

  const displayOptions = getHeatmapDisplayOptions(settings);
  const fontSize = renderingContext.theme.cartesian.label.fontSize;
  const { getColor, colorScheme = "light" } = renderingContext;
  const textColor = getColor("text-secondary");
  const strongTextColor = getColor("text-primary");
  const emptyCellColor = getColor("background-secondary");

  const scale = useMemo(
    () =>
      getHeatmapColorScale(valueExtent, {
        positive: displayOptions.color ?? getColor("brand"),
        negative: getColor("error"),
        background: getColor("background-primary"),
        colorScheme,
      }),
    [valueExtent, displayOptions.color, getColor, colorScheme],
  );

  const layout = useMemo(
    () =>
      getHeatmapLayout({
        width,
        height,
        rowLabels: model.rowItems.map((item) =>
          formatDimension(item.value, columns.row.column, settings),
        ),
        columnLabels: model.columnItems.map((item) =>
          formatDimension(item.value, columns.column.column, settings),
        ),
        fontSize,
        measureText: (text) =>
          renderingContext.measureText(text, {
            size: fontSize,
            family: renderingContext.fontFamily,
            weight: AXIS_LABEL_WEIGHT,
          }),
      }),
    [width, height, model, columns, settings, fontSize, renderingContext],
  );

  const cellViews = useMemo(
    () =>
      getCellViews({
        model,
        layout,
        scale,
        emptyCellColor,
        showValues: displayOptions.showValues,
        valueColumn: columns.value.column,
        settings,
        fontSize,
        renderingContext,
      }),
    [
      model,
      layout,
      scale,
      emptyCellColor,
      displayOptions.showValues,
      columns,
      settings,
      fontSize,
      renderingContext,
    ],
  );

  const isClickable = useMemo(() => {
    const sample = findFirstCell(model);
    return (
      sample != null &&
      visualizationIsClickable(
        getCellClickObject({ ...sample, model, columns, cols, settings }),
      )
    );
  }, [model, columns, cols, settings, visualizationIsClickable]);

  const handleCellHover = useCallback(
    (position: CellPosition, element: Element) => {
      setHoveredCell(position);
      const cell = model.cells[position.rowIndex][position.columnIndex];
      onHoverChange(
        cell == null
          ? null
          : {
              element,
              data: [
                {
                  key: columns.row.column.display_name,
                  value: model.rowItems[position.rowIndex].value,
                  col: columns.row.column,
                },
                {
                  key: columns.column.column.display_name,
                  value: model.columnItems[position.columnIndex].value,
                  col: columns.column.column,
                },
                {
                  key: columns.value.column.display_name,
                  value: cell.value,
                  col: columns.value.column,
                },
              ],
            },
      );
    },
    [model, columns, onHoverChange],
  );

  const handleCellClick = useCallback(
    (position: CellPosition, event: ReactMouseEvent<SVGGElement>) => {
      const cell = model.cells[position.rowIndex][position.columnIndex];
      if (cell == null || !(event.target instanceof Element)) {
        return;
      }
      const clickObject = getCellClickObject({
        position,
        cell,
        model,
        columns,
        cols,
        settings,
      });
      if (visualizationIsClickable(clickObject)) {
        onVisualizationClick({
          ...clickObject,
          event: event.nativeEvent,
          element: event.target,
        });
      }
    },
    [
      model,
      columns,
      cols,
      settings,
      visualizationIsClickable,
      onVisualizationClick,
    ],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
    onHoverChange(null);
  }, [onHoverChange]);

  return (
    <Flex
      className={className}
      direction="column"
      w="100%"
      h="100%"
      data-testid="ma-heatmap"
    >
      {displayOptions.showLegend && (
        <HeatmapLegend
          valueExtent={valueExtent}
          scale={scale}
          valueColumn={columns.value.column}
          settings={settings}
          hasEmptyCells={model.emptyCellCount > 0}
        />
      )}
      <Box ref={containerRef} flex={1} mih={0} pos="relative">
        {width > 0 && height > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={t`Heatmap of ${columns.value.column.display_name} by ${columns.row.column.display_name} and ${columns.column.column.display_name}`}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              fontFamily: renderingContext.fontFamily,
            }}
            onMouseLeave={handleMouseLeave}
          >
            <RowLabels
              model={model}
              layout={layout}
              fontSize={fontSize}
              hoveredRowIndex={hoveredCell?.rowIndex}
              textColor={textColor}
              strongTextColor={strongTextColor}
            />
            <ColumnLabels
              model={model}
              layout={layout}
              fontSize={fontSize}
              hoveredColumnIndex={hoveredCell?.columnIndex}
              textColor={textColor}
              strongTextColor={strongTextColor}
            />
            <HeatmapCells
              cells={cellViews}
              cellRadius={layout.cellRadius}
              fontSize={fontSize}
              isClickable={isClickable}
              onCellHover={handleCellHover}
              onCellClick={handleCellClick}
            />
            {hoveredCell != null && (
              <rect
                {...getCellBounds(layout, hoveredCell)}
                rx={layout.cellRadius}
                fill="none"
                stroke={strongTextColor}
                strokeWidth={HOVER_OUTLINE_WIDTH}
                pointerEvents="none"
              />
            )}
          </svg>
        )}
      </Box>
    </Flex>
  );
}

type HeatmapCellsProps = {
  cells: CellView[];
  cellRadius: number;
  fontSize: number;
  isClickable: boolean;
  onCellHover: (position: CellPosition, element: Element) => void;
  onCellClick: (
    position: CellPosition,
    event: ReactMouseEvent<SVGGElement>,
  ) => void;
};

const HeatmapCells = memo(function HeatmapCells({
  cells,
  cellRadius,
  fontSize,
  isClickable,
  onCellHover,
  onCellClick,
}: HeatmapCellsProps) {
  const handleMouseOver = (event: ReactMouseEvent<SVGGElement>) => {
    const position = getCellPosition(event.target);
    if (position != null && event.target instanceof Element) {
      onCellHover(position, event.target);
    }
  };

  const handleClick = (event: ReactMouseEvent<SVGGElement>) => {
    const position = getCellPosition(event.target);
    if (position != null) {
      onCellClick(position, event);
    }
  };

  return (
    <g onMouseOver={handleMouseOver} onClick={handleClick}>
      {cells.map((cell) => (
        <g key={cell.key}>
          <rect
            x={cell.x}
            y={cell.y}
            width={cell.width}
            height={cell.height}
            rx={cellRadius}
            fill={cell.fill}
            style={{
              cursor: cell.hasValue && isClickable ? "pointer" : "default",
            }}
            data-row={cell.rowIndex}
            data-column={cell.columnIndex}
            data-testid="ma-heatmap-cell"
          />
          {cell.label != null && (
            <text
              x={cell.x + cell.width / 2}
              y={cell.y + cell.height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
              fontWeight={CELL_LABEL_WEIGHT}
              fill={cell.labelColor}
              pointerEvents="none"
            >
              {cell.label}
            </text>
          )}
        </g>
      ))}
    </g>
  );
});

type AxisLabelsProps = {
  model: HeatmapModel;
  layout: HeatmapLayout;
  fontSize: number;
  textColor: string;
  strongTextColor: string;
};

function RowLabels({
  model,
  layout,
  fontSize,
  hoveredRowIndex,
  textColor,
  strongTextColor,
}: AxisLabelsProps & { hoveredRowIndex: number | undefined }) {
  return (
    <g>
      {layout.rowLabels.map((label, rowIndex) =>
        rowIndex % layout.rowLabelStep === 0 ? (
          <text
            key={model.rowItems[rowIndex].key}
            x={layout.plotX - LABEL_GAP}
            y={layout.plotY + (rowIndex + 0.5) * layout.cellHeight}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={fontSize}
            fontWeight={AXIS_LABEL_WEIGHT}
            fill={rowIndex === hoveredRowIndex ? strongTextColor : textColor}
            data-testid="ma-heatmap-row-label"
          >
            {label}
          </text>
        ) : null,
      )}
    </g>
  );
}

function ColumnLabels({
  model,
  layout,
  fontSize,
  hoveredColumnIndex,
  textColor,
  strongTextColor,
}: AxisLabelsProps & { hoveredColumnIndex: number | undefined }) {
  const y = layout.plotY + layout.plotHeight + LABEL_GAP;

  return (
    <g>
      {layout.columnLabels.map((label, columnIndex) => {
        if (columnIndex % layout.columnLabelStep !== 0) {
          return null;
        }
        const x = layout.plotX + (columnIndex + 0.5) * layout.cellWidth;
        const fill =
          columnIndex === hoveredColumnIndex ? strongTextColor : textColor;
        const key = model.columnItems[columnIndex].key;

        if (layout.areColumnLabelsRotated) {
          return (
            <text
              key={key}
              transform={`translate(${x}, ${y}) rotate(-45)`}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={fontSize}
              fontWeight={AXIS_LABEL_WEIGHT}
              fill={fill}
              data-testid="ma-heatmap-column-label"
            >
              {label}
            </text>
          );
        }
        return (
          <text
            key={key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="hanging"
            fontSize={fontSize}
            fontWeight={AXIS_LABEL_WEIGHT}
            fill={fill}
            data-testid="ma-heatmap-column-label"
          >
            {label}
          </text>
        );
      })}
    </g>
  );
}

type HeatmapLegendProps = {
  valueExtent: [number, number];
  scale: HeatmapColorScale;
  valueColumn: DatasetColumn;
  settings: ComputedVisualizationSettings;
  hasEmptyCells: boolean;
};

function HeatmapLegend({
  valueExtent,
  scale,
  valueColumn,
  settings,
  hasEmptyCells,
}: HeatmapLegendProps) {
  const stops = getHeatmapLegendStops(valueExtent, scale);
  const gradient = `linear-gradient(to right, ${stops
    .map((stop) => `${stop.color} ${stop.offset * 100}%`)
    .join(", ")})`;
  const limit = Math.max(Math.abs(valueExtent[0]), Math.abs(valueExtent[1]));
  const [low, high] = scale.isDiverging ? [-limit, limit] : valueExtent;

  return (
    <Flex
      h={HEATMAP_LEGEND_HEIGHT}
      px="sm"
      gap="sm"
      align="center"
      justify="flex-end"
      data-testid="ma-heatmap-legend"
    >
      <Text fz="sm" c="text-secondary" truncate>
        {valueColumn.display_name}
      </Text>
      <Text fz="sm" c="text-secondary">
        {formatMetric(low, valueColumn, settings, { compact: true })}
      </Text>
      <Box
        w={LEGEND_GRADIENT_WIDTH}
        h={LEGEND_GRADIENT_HEIGHT}
        bdrs="xs"
        style={{ background: gradient }}
      />
      <Text fz="sm" c="text-secondary">
        {formatMetric(high, valueColumn, settings, { compact: true })}
      </Text>
      {hasEmptyCells && (
        <Flex align="center" gap="xs">
          <Box
            w={LEGEND_SWATCH_SIZE}
            h={LEGEND_SWATCH_SIZE}
            bdrs="xs"
            bg="background-secondary"
          />
          <Text fz="sm" c="text-secondary">{t`No data`}</Text>
        </Flex>
      )}
    </Flex>
  );
}

type CellViewOptions = {
  model: HeatmapModel;
  layout: HeatmapLayout;
  scale: HeatmapColorScale;
  emptyCellColor: string;
  showValues: boolean;
  valueColumn: DatasetColumn;
  settings: ComputedVisualizationSettings;
  fontSize: number;
  renderingContext: RenderingContext;
};

function getCellViews({
  model,
  layout,
  scale,
  emptyCellColor,
  showValues,
  valueColumn,
  settings,
  fontSize,
  renderingContext,
}: CellViewOptions): CellView[] {
  const getLabel = getCellLabeler({
    layout,
    showValues,
    valueColumn,
    settings,
    fontSize,
    renderingContext,
  });

  return model.cells.flatMap((rowCells, rowIndex) =>
    rowCells.map((cell, columnIndex) => {
      const fill = cell == null ? emptyCellColor : scale.getColor(cell.value);
      const label = cell == null ? null : getLabel(cell.value);
      return {
        key: `${model.rowItems[rowIndex].key}:${model.columnItems[columnIndex].key}`,
        rowIndex,
        columnIndex,
        ...getCellBounds(layout, { rowIndex, columnIndex }),
        fill,
        hasValue: cell != null,
        label,
        labelColor:
          label == null
            ? fill
            : getTextColorForBackground(fill, renderingContext.getColor),
      };
    }),
  );
}

type CellLabelerOptions = Pick<
  CellViewOptions,
  "layout" | "showValues" | "valueColumn" | "settings" | "fontSize"
> & {
  renderingContext: RenderingContext;
};

function getCellLabeler({
  layout,
  showValues,
  valueColumn,
  settings,
  fontSize,
  renderingContext,
}: CellLabelerOptions): (value: number) => string | null {
  const availableWidth = layout.cellWidth - layout.cellGap - CELL_LABEL_PADDING;
  const availableHeight = layout.cellHeight - layout.cellGap;
  if (
    !showValues ||
    availableWidth <= 0 ||
    availableHeight < fontSize + CELL_LABEL_SPACING
  ) {
    return () => null;
  }

  const fits = (text: string) =>
    renderingContext.measureText(text, {
      size: fontSize,
      family: renderingContext.fontFamily,
      weight: CELL_LABEL_WEIGHT,
    }) <= availableWidth;

  return (value) => {
    const fullLabel = formatMetric(value, valueColumn, settings, {
      compact: false,
    });
    if (fits(fullLabel)) {
      return fullLabel;
    }
    const compactLabel = formatMetric(value, valueColumn, settings, {
      compact: true,
    });
    return fits(compactLabel) ? compactLabel : null;
  };
}

function getCellBounds(
  layout: HeatmapLayout,
  position: CellPosition,
): CellBounds {
  const gap = layout.cellGap;
  return {
    x: layout.plotX + position.columnIndex * layout.cellWidth + gap / 2,
    y: layout.plotY + position.rowIndex * layout.cellHeight + gap / 2,
    width: Math.max(0, layout.cellWidth - gap),
    height: Math.max(0, layout.cellHeight - gap),
  };
}

function getCellPosition(target: EventTarget): CellPosition | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const rowIndex = target.getAttribute("data-row");
  const columnIndex = target.getAttribute("data-column");
  if (rowIndex == null || columnIndex == null) {
    return null;
  }
  return {
    rowIndex: parseInt(rowIndex, 10),
    columnIndex: parseInt(columnIndex, 10),
  };
}

function findFirstCell(
  model: HeatmapModel,
): { position: CellPosition; cell: HeatmapCell } | null {
  for (const [rowIndex, rowCells] of model.cells.entries()) {
    for (const [columnIndex, cell] of rowCells.entries()) {
      if (cell != null) {
        return { position: { rowIndex, columnIndex }, cell };
      }
    }
  }
  return null;
}

type CellClickObjectOptions = {
  position: CellPosition;
  cell: HeatmapCell;
  model: HeatmapModel;
  columns: HeatmapColumns;
  cols: DatasetColumn[];
  settings: ComputedVisualizationSettings;
};

function getCellClickObject({
  position,
  cell,
  model,
  columns,
  cols,
  settings,
}: CellClickObjectOptions): ClickObject {
  return {
    value: cell.value,
    column: columns.value.column,
    dimensions: [
      {
        value: model.rowItems[position.rowIndex].value,
        column: columns.row.column,
      },
      {
        value: model.columnItems[position.columnIndex].value,
        column: columns.column.column,
      },
    ],
    settings,
    origin: { row: cell.sourceRow, cols },
    data: cols.map((col, index) => ({ col, value: cell.sourceRow[index] })),
  };
}

export const MaHeatmap = assignLazily(
  MaHeatmapComponent,
  MA_HEATMAP_DEFINITION,
);
