import { useElementSize } from "@mantine/hooks";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { Box, Flex, Text } from "metabase/ui";
import { assignLazily } from "metabase/utils/merge-lazily";
import { formatValue } from "metabase/value-formatting";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type {
  ClickObject,
  VisualizationProps,
} from "metabase/visualizations/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/viz-core";
import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import {
  type HeatmapColorScale,
  getCellLabelColor,
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

const AXIS_LABEL_WEIGHT = 400;
const CELL_LABEL_WEIGHT = 700;
const CELL_LABEL_PADDING = 6;

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
  const [{ data }] = rawSeries;
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
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const [hoveredCell, setHoveredCell] = useState<CellPosition | null>(null);

  const displayOptions = getHeatmapDisplayOptions(settings);
  const fontSize = renderingContext.theme.cartesian.label.fontSize;
  const { getColor, colorScheme = "light" } = renderingContext;

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

  const layout = useMemo(() => {
    const measureLabel = (text: string) =>
      renderingContext.measureText(text, {
        size: fontSize,
        family: renderingContext.fontFamily,
        weight: AXIS_LABEL_WEIGHT,
      });
    return getHeatmapLayout({
      width,
      height,
      rowLabels: model.rowItems.map((item) =>
        formatDimension(item.value, columns.row.column, settings),
      ),
      columnLabels: model.columnItems.map((item) =>
        formatDimension(item.value, columns.column.column, settings),
      ),
      fontSize,
      measureText: measureLabel,
    });
  }, [width, height, model, columns, settings, fontSize, renderingContext]);

  const cellLabels = useMemo(
    () =>
      displayOptions.showValues
        ? getCellLabels({
            model,
            layout,
            valueColumn: columns.value.column,
            settings,
            fontSize,
            renderingContext,
          })
        : null,
    [
      displayOptions.showValues,
      model,
      layout,
      columns,
      settings,
      fontSize,
      renderingContext,
    ],
  );

  const handleCellHover = useCallback(
    (position: CellPosition, element: Element) => {
      setHoveredCell(position);
      const cell = model.cells[position.rowIndex][position.columnIndex];
      if (cell == null) {
        onHoverChange(null);
        return;
      }
      onHoverChange({
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
      });
    },
    [model, columns, onHoverChange],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
    onHoverChange(null);
  }, [onHoverChange]);

  const handleCellClick = useCallback(
    (
      position: CellPosition,
      cell: HeatmapCell,
      event: ReactMouseEvent<SVGRectElement>,
    ) => {
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
          element: event.currentTarget,
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

  const textColor = getColor("text-secondary");
  const strongTextColor = getColor("text-primary");
  const emptyCellColor = getColor("background-secondary");

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
          emptyCellColor={emptyCellColor}
        />
      )}
      <div ref={ref} style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {width > 0 && height > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={t`Heatmap of ${columns.value.column.display_name} by ${columns.row.column.display_name} and ${columns.column.column.display_name}`}
            style={{
              display: "block",
              fontFamily: renderingContext.fontFamily,
            }}
            onMouseLeave={handleMouseLeave}
          >
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
                    fontWeight={
                      hoveredCell?.rowIndex === rowIndex
                        ? CELL_LABEL_WEIGHT
                        : AXIS_LABEL_WEIGHT
                    }
                    fill={
                      hoveredCell?.rowIndex === rowIndex
                        ? strongTextColor
                        : textColor
                    }
                    data-testid="ma-heatmap-row-label"
                  >
                    {label}
                  </text>
                ) : null,
              )}
            </g>
            <g>
              {layout.columnLabels.map((label, columnIndex) =>
                columnIndex % layout.columnLabelStep === 0 ? (
                  <ColumnLabel
                    key={model.columnItems[columnIndex].key}
                    label={label}
                    columnIndex={columnIndex}
                    layout={layout}
                    fontSize={fontSize}
                    isHighlighted={hoveredCell?.columnIndex === columnIndex}
                    textColor={textColor}
                    strongTextColor={strongTextColor}
                  />
                ) : null,
              )}
            </g>
            <g>
              {model.cells.map((rowCells, rowIndex) =>
                rowCells.map((cell, columnIndex) => {
                  const position = { rowIndex, columnIndex };
                  const fill =
                    cell == null ? emptyCellColor : scale.getColor(cell.value);
                  const label = cellLabels?.[rowIndex][columnIndex] ?? null;
                  const bounds = getCellBounds(layout, position);
                  return (
                    <g
                      key={`${model.rowItems[rowIndex].key}:${model.columnItems[columnIndex].key}`}
                    >
                      <rect
                        x={bounds.x}
                        y={bounds.y}
                        width={bounds.width}
                        height={bounds.height}
                        rx={layout.cellRadius}
                        fill={fill}
                        style={{ cursor: cell != null ? "pointer" : "default" }}
                        data-testid="ma-heatmap-cell"
                        onMouseEnter={(event) =>
                          handleCellHover(position, event.currentTarget)
                        }
                        onClick={(event) => {
                          if (cell != null) {
                            handleCellClick(position, cell, event);
                          }
                        }}
                      />
                      {label != null && (
                        <text
                          x={bounds.x + bounds.width / 2}
                          y={bounds.y + bounds.height / 2}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={fontSize}
                          fontWeight={CELL_LABEL_WEIGHT}
                          fill={getCellLabelColor(fill)}
                          pointerEvents="none"
                        >
                          {label}
                        </text>
                      )}
                    </g>
                  );
                }),
              )}
            </g>
            {hoveredCell != null && (
              <rect
                {...getCellBounds(layout, hoveredCell)}
                rx={layout.cellRadius}
                fill="none"
                stroke={strongTextColor}
                strokeWidth={1.5}
                pointerEvents="none"
              />
            )}
          </svg>
        )}
      </div>
    </Flex>
  );
}

type ColumnLabelProps = {
  label: string;
  columnIndex: number;
  layout: HeatmapLayout;
  fontSize: number;
  isHighlighted: boolean;
  textColor: string;
  strongTextColor: string;
};

function ColumnLabel({
  label,
  columnIndex,
  layout,
  fontSize,
  isHighlighted,
  textColor,
  strongTextColor,
}: ColumnLabelProps) {
  const x = layout.plotX + (columnIndex + 0.5) * layout.cellWidth;
  const y = layout.plotY + layout.plotHeight + LABEL_GAP;
  const commonProps = {
    fontSize,
    fontWeight: isHighlighted ? CELL_LABEL_WEIGHT : AXIS_LABEL_WEIGHT,
    fill: isHighlighted ? strongTextColor : textColor,
    "data-testid": "ma-heatmap-column-label",
  };

  if (layout.areColumnLabelsRotated) {
    return (
      <text
        {...commonProps}
        transform={`translate(${x}, ${y}) rotate(-45)`}
        textAnchor="end"
        dominantBaseline="central"
      >
        {label}
      </text>
    );
  }

  return (
    <text
      {...commonProps}
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="hanging"
    >
      {label}
    </text>
  );
}

type HeatmapLegendProps = {
  valueExtent: [number, number];
  scale: HeatmapColorScale;
  valueColumn: DatasetColumn;
  settings: ComputedVisualizationSettings;
  hasEmptyCells: boolean;
  emptyCellColor: string;
};

function HeatmapLegend({
  valueExtent,
  scale,
  valueColumn,
  settings,
  hasEmptyCells,
  emptyCellColor,
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
        {formatMetric(low, valueColumn, settings, true)}
      </Text>
      <Box w={96} h={8} style={{ background: gradient, borderRadius: 4 }} />
      <Text fz="sm" c="text-secondary">
        {formatMetric(high, valueColumn, settings, true)}
      </Text>
      {hasEmptyCells && (
        <Flex align="center" gap="xs">
          <Box
            w={10}
            h={10}
            style={{ background: emptyCellColor, borderRadius: 2 }}
          />
          <Text fz="sm" c="text-secondary">{t`No data`}</Text>
        </Flex>
      )}
    </Flex>
  );
}

function getCellBounds(layout: HeatmapLayout, position: CellPosition) {
  const gap = layout.cellGap;
  return {
    x: layout.plotX + position.columnIndex * layout.cellWidth + gap / 2,
    y: layout.plotY + position.rowIndex * layout.cellHeight + gap / 2,
    width: Math.max(0, layout.cellWidth - gap),
    height: Math.max(0, layout.cellHeight - gap),
  };
}

type CellLabelOptions = {
  model: HeatmapModel;
  layout: HeatmapLayout;
  valueColumn: DatasetColumn;
  settings: ComputedVisualizationSettings;
  fontSize: number;
  renderingContext: RenderingContext;
};

function getCellLabels({
  model,
  layout,
  valueColumn,
  settings,
  fontSize,
  renderingContext,
}: CellLabelOptions): (string | null)[][] | null {
  const availableWidth = layout.cellWidth - layout.cellGap - CELL_LABEL_PADDING;
  const availableHeight = layout.cellHeight - layout.cellGap;
  if (availableHeight < fontSize + 2 || availableWidth <= 0) {
    return null;
  }

  const fits = (text: string) =>
    renderingContext.measureText(text, {
      size: fontSize,
      family: renderingContext.fontFamily,
      weight: CELL_LABEL_WEIGHT,
    }) <= availableWidth;

  return model.cells.map((rowCells) =>
    rowCells.map((cell) => {
      if (cell == null) {
        return null;
      }
      const fullLabel = formatMetric(cell.value, valueColumn, settings, false);
      if (fits(fullLabel)) {
        return fullLabel;
      }
      const compactLabel = formatMetric(
        cell.value,
        valueColumn,
        settings,
        true,
      );
      return fits(compactLabel) ? compactLabel : null;
    }),
  );
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
  const sourceRow: RowValues = cell.sourceRow;
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
    origin: { row: sourceRow, cols },
    data: cols.map((col, index) => ({ col, value: sourceRow[index] })),
  };
}

function formatDimension(
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

function formatMetric(
  value: number,
  column: DatasetColumn,
  settings: ComputedVisualizationSettings,
  compact: boolean,
): string {
  return String(
    formatValue(value, {
      ...settings.column?.(column),
      jsx: false,
      compact,
    }),
  );
}

export const MaHeatmap = assignLazily(
  MaHeatmapComponent,
  MA_HEATMAP_DEFINITION,
);
