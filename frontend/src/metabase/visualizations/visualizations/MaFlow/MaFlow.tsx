import {
  type MouseEvent as ReactMouseEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { usePalette } from "metabase/common/hooks/use-palette";
import { Box, Flex, Text } from "metabase/ui";
import { getColorsForValues } from "metabase/ui/colors/charts";
import { assignLazily } from "metabase/utils/merge-lazily";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type {
  ClickObject,
  VisualizationProps,
} from "metabase/visualizations/types";
import {
  type ComputedVisualizationSettings,
  type HoveredObject,
  type RenderingContext,
  extractRemappings,
} from "metabase/viz-core";
import type { DatasetColumn } from "metabase-types/api";

import { getAxisKey } from "../MaShared/axis";
import { formatDimension, formatMetric, formatShare } from "../MaShared/format";
import { useContainerSize } from "../MaShared/use-container-size";

import { MA_FLOW_DEFINITION } from "./definition";
import {
  type FlowBand,
  type FlowLayout,
  type FlowNodeText,
  getFlowLayout,
} from "./layout";
import {
  type FlowColor,
  type FlowColumns,
  type FlowModel,
  type FlowTarget,
  getFlowColumns,
  getFlowModel,
  getTracedLinkValues,
} from "./model";
import { getFlowColumnNames, getFlowDisplayOptions } from "./settings";

const LABEL_WEIGHT = 400;
const NAME_WEIGHT = 700;
const TITLE_WEIGHT = 700;
const BAND_OPACITY = 0.45;
const FADED_BAND_OPACITY = 0.12;
const TRACED_BAND_OPACITY = 0.85;
const LABEL_HALO_WIDTH = 4;
const LEGEND_LIMIT = 12;
const LEGEND_SWATCH_SIZE = 10;

function MaFlowComponent({
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
  const { nodeOrder } = getFlowDisplayOptions(settings);

  const columns = useMemo(
    () => getFlowColumns(data.cols, getFlowColumnNames(settings)),
    [data.cols, settings],
  );
  const model = useMemo(
    () => (columns ? getFlowModel(data.rows, columns, { nodeOrder }) : null),
    [data.rows, columns, nodeOrder],
  );

  const warnings = useMemo(
    () =>
      model != null && model.skippedRowCount > 0
        ? [t`Rows with an empty, zero or negative size aren't drawn.`]
        : [],
    [model],
  );
  useEffect(() => {
    onRender({ warnings });
  }, [onRender, warnings]);

  if (columns == null || model == null || model.total <= 0) {
    return null;
  }

  return (
    <FlowView
      className={className}
      columns={columns}
      model={model}
      settings={settings}
      renderingContext={renderingContext}
      onHoverChange={onHoverChange}
      onVisualizationClick={onVisualizationClick}
      visualizationIsClickable={visualizationIsClickable}
    />
  );
}

type FlowViewProps = Pick<
  VisualizationProps,
  | "className"
  | "settings"
  | "onHoverChange"
  | "onVisualizationClick"
  | "visualizationIsClickable"
> & {
  columns: FlowColumns;
  model: FlowModel;
  renderingContext: RenderingContext;
};

function FlowView({
  className,
  columns,
  model,
  settings,
  renderingContext,
  onHoverChange,
  onVisualizationClick,
  visualizationIsClickable,
}: FlowViewProps) {
  const { ref, width, height } = useContainerSize();
  const palette = usePalette();
  const [tracedTarget, setTracedTarget] = useState<FlowTarget | null>(null);

  const { showValues, showLegend } = getFlowDisplayOptions(settings);
  const fontSize = renderingContext.theme.cartesian.label.fontSize;
  const { getColor } = renderingContext;
  const colorColumn = columns.steps[columns.colorStepIndex].column;

  const colorLabels = useMemo(
    () =>
      new Map(
        model.colors.map((color) => [
          color.key,
          getColorLabel(color, colorColumn, settings),
        ]),
      ),
    [model, colorColumn, settings],
  );
  const colorsByKey = useMemo(() => {
    const labels = model.colors
      .filter((color) => !color.isEnded)
      .map((color) => colorLabels.get(color.key) ?? "");
    const mapping = getColorsForValues(labels, null, palette);
    return new Map(
      model.colors.map((color) => [
        color.key,
        color.isEnded
          ? getColor("text-tertiary")
          : (mapping[colorLabels.get(color.key) ?? ""] ?? getColor("brand")),
      ]),
    );
  }, [model, colorLabels, palette, getColor]);

  const nodeTexts = useMemo(
    () =>
      new Map<string, FlowNodeText>(
        Array.from(model.nodesByKey.values()).map((node) => [
          node.key,
          {
            name: formatDimension(
              node.value,
              columns.steps[node.stepIndex].column,
              settings,
            ),
            detail: showValues
              ? `${formatMetric(node.total, columns.value.column, settings, { compact: true })} · ${formatShare(node.total / model.total)}`
              : null,
          },
        ]),
      ),
    [model, columns, settings, showValues],
  );

  const layout = useMemo(() => {
    const measure = (weight: number) => (text: string) =>
      renderingContext.measureText(text, {
        size: fontSize,
        family: renderingContext.fontFamily,
        weight,
      });
    return getFlowLayout({
      width,
      height,
      model,
      stepTitles: columns.steps.map((step) => step.column.display_name),
      nodeTexts,
      colorOrder: model.colors.map((color) => color.key),
      fontSize,
      measureText: measure(LABEL_WEIGHT),
      measureBoldText: measure(NAME_WEIGHT),
    });
  }, [width, height, model, columns, nodeTexts, fontSize, renderingContext]);

  const tracedValues = useMemo(
    () => (tracedTarget ? getTracedLinkValues(model, tracedTarget) : null),
    [model, tracedTarget],
  );

  const isClickable = useMemo(() => {
    const firstNode = model.steps[0][0];
    return (
      firstNode != null &&
      visualizationIsClickable(
        getNodeClickObject(firstNode.key, model, columns, settings),
      )
    );
  }, [model, columns, settings, visualizationIsClickable]);

  const handleHover = useCallback(
    (target: FlowTarget, element: Element) => {
      setTracedTarget(target);
      onHoverChange({
        element,
        ...getHoverContent({
          target,
          model,
          columns,
          settings,
          colorsByKey,
          colorLabels,
        }),
      });
    },
    [model, columns, settings, colorsByKey, colorLabels, onHoverChange],
  );

  const handleClick = useCallback(
    (target: FlowTarget, event: ReactMouseEvent<SVGGElement>) => {
      if (!(event.target instanceof Element)) {
        return;
      }
      const clickObject =
        target.type === "node"
          ? getNodeClickObject(target.key, model, columns, settings)
          : getLinkClickObject(target.key, model, columns, settings);
      if (clickObject != null && visualizationIsClickable(clickObject)) {
        onVisualizationClick({
          ...clickObject,
          event: event.nativeEvent,
          element: event.target,
        });
      }
    },
    [model, columns, settings, visualizationIsClickable, onVisualizationClick],
  );

  const handleMouseOver = (event: ReactMouseEvent<SVGGElement>) => {
    const target = getEventTarget(event.target);
    if (target != null && event.target instanceof Element) {
      handleHover(target, event.target);
    }
  };

  const handleSvgClick = (event: ReactMouseEvent<SVGGElement>) => {
    const target = getEventTarget(event.target);
    if (target != null) {
      handleClick(target, event);
    }
  };

  const handleMouseLeave = useCallback(() => {
    setTracedTarget(null);
    onHoverChange(null);
  }, [onHoverChange]);

  const neutralNodeColor = getColor("text-secondary");
  const haloColor = getColor("background-primary");

  return (
    <Flex
      className={className}
      direction="column"
      w="100%"
      h="100%"
      data-testid="ma-flow"
    >
      {showLegend && (
        <FlowLegend
          colors={model.colors}
          colorsByKey={colorsByKey}
          colorLabels={colorLabels}
          colorColumn={colorColumn}
        />
      )}
      <Box ref={ref} flex={1} mih={0} pos="relative">
        {width > 0 && height > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={t`Flow of ${columns.value.column.display_name} through ${columns.steps.map((step) => step.column.display_name).join(", ")}`}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              fontFamily: renderingContext.fontFamily,
            }}
            onMouseLeave={handleMouseLeave}
          >
            <g onMouseOver={handleMouseOver} onClick={handleSvgClick}>
              <FlowBands
                model={model}
                layout={layout}
                colorsByKey={colorsByKey}
                opacity={tracedValues ? FADED_BAND_OPACITY : BAND_OPACITY}
                isClickable={isClickable}
              />
              {tracedValues && (
                <TracedBands
                  model={model}
                  layout={layout}
                  colorsByKey={colorsByKey}
                  tracedValues={tracedValues}
                />
              )}
              {model.steps.flat().map((node) => {
                const rect = layout.nodes.get(node.key);
                if (rect == null) {
                  return null;
                }
                const ownColor =
                  node.stepIndex === columns.colorStepIndex
                    ? colorsByKey.get(getAxisKey(node.value))
                    : undefined;
                return (
                  <rect
                    key={node.key}
                    {...rect}
                    rx={2}
                    fill={ownColor ?? neutralNodeColor}
                    style={{ cursor: isClickable ? "pointer" : "default" }}
                    data-node={node.key}
                    data-testid="ma-flow-node"
                  />
                );
              })}
            </g>
            <g pointerEvents="none">
              {Array.from(layout.labels.entries()).map(([key, label]) => (
                <text
                  key={key}
                  x={label.x}
                  y={label.y}
                  textAnchor={label.anchor}
                  fontSize={fontSize}
                  fill={getColor("text-primary")}
                  stroke={haloColor}
                  strokeWidth={LABEL_HALO_WIDTH}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                  data-testid="ma-flow-label"
                >
                  <tspan
                    x={label.x}
                    dy={label.detail != null ? "-0.2em" : "0.35em"}
                    fontWeight={NAME_WEIGHT}
                  >
                    {label.name}
                  </tspan>
                  {label.detail != null && (
                    <tspan
                      x={label.x}
                      dy="1.25em"
                      fontWeight={LABEL_WEIGHT}
                      fill={getColor("text-secondary")}
                    >
                      {label.detail}
                    </tspan>
                  )}
                </text>
              ))}
              {layout.stepTitles.map((title, stepIndex) => (
                <text
                  key={stepIndex}
                  x={title.x}
                  y={title.y}
                  textAnchor={title.anchor}
                  fontSize={fontSize}
                  fontWeight={TITLE_WEIGHT}
                  fill={getColor("text-tertiary")}
                  style={{
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                  data-testid="ma-flow-step-title"
                >
                  {title.text}
                </text>
              ))}
            </g>
          </svg>
        )}
      </Box>
    </Flex>
  );
}

type FlowBandsProps = {
  model: FlowModel;
  layout: FlowLayout;
  colorsByKey: Map<string, string>;
  opacity: number;
  isClickable: boolean;
};

const FlowBands = memo(function FlowBands({
  model,
  layout,
  colorsByKey,
  opacity,
  isClickable,
}: FlowBandsProps) {
  return (
    <g>
      {model.links.map((link) => {
        const band = layout.bands.get(link.key);
        if (band == null) {
          return null;
        }
        return (
          <path
            key={link.key}
            d={getBandPath(band, band.width)}
            fill={colorsByKey.get(link.colorKey)}
            fillOpacity={opacity}
            style={{
              transition: "fill-opacity 120ms",
              cursor: isClickable ? "pointer" : "default",
            }}
            data-link={link.key}
            data-testid="ma-flow-band"
          />
        );
      })}
    </g>
  );
});

type TracedBandsProps = {
  model: FlowModel;
  layout: FlowLayout;
  colorsByKey: Map<string, string>;
  tracedValues: Map<string, number>;
};

function TracedBands({
  model,
  layout,
  colorsByKey,
  tracedValues,
}: TracedBandsProps) {
  return (
    <g pointerEvents="none">
      {model.links.map((link) => {
        const band = layout.bands.get(link.key);
        const tracedValue = tracedValues.get(link.key);
        if (band == null || tracedValue == null) {
          return null;
        }
        return (
          <path
            key={link.key}
            d={getBandPath(band, tracedValue * layout.scale)}
            fill={colorsByKey.get(link.colorKey)}
            fillOpacity={TRACED_BAND_OPACITY}
            data-testid="ma-flow-traced-band"
          />
        );
      })}
    </g>
  );
}

type FlowLegendProps = {
  colors: FlowColor[];
  colorsByKey: Map<string, string>;
  colorLabels: Map<string, string>;
  colorColumn: DatasetColumn;
};

function FlowLegend({
  colors,
  colorsByKey,
  colorLabels,
  colorColumn,
}: FlowLegendProps) {
  const shownColors = colors.slice(0, LEGEND_LIMIT);
  const hiddenCount = colors.length - shownColors.length;

  return (
    <Flex
      px="sm"
      py="xs"
      gap="md"
      align="center"
      wrap="wrap"
      data-testid="ma-flow-legend"
    >
      <Text fz="sm" c="text-secondary">
        {colorColumn.display_name}
      </Text>
      {shownColors.map((color) => (
        <Flex key={color.key} align="center" gap="xs">
          <Box
            w={LEGEND_SWATCH_SIZE}
            h={LEGEND_SWATCH_SIZE}
            bdrs="xs"
            style={{ background: colorsByKey.get(color.key) }}
          />
          <Text fz="sm">{colorLabels.get(color.key)}</Text>
        </Flex>
      ))}
      {hiddenCount > 0 && (
        <Text fz="sm" c="text-secondary">
          {t`and ${hiddenCount} more`}
        </Text>
      )}
    </Flex>
  );
}

function getBandPath(band: FlowBand, bandWidth: number): string {
  const { sourceX, sourceY, targetX, targetY } = band;
  const middle = (sourceX + targetX) / 2;
  return [
    `M${sourceX},${sourceY}`,
    `C${middle},${sourceY} ${middle},${targetY} ${targetX},${targetY}`,
    `L${targetX},${targetY + bandWidth}`,
    `C${middle},${targetY + bandWidth} ${middle},${sourceY + bandWidth} ${sourceX},${sourceY + bandWidth}`,
    "Z",
  ].join(" ");
}

function getEventTarget(target: EventTarget): FlowTarget | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const nodeKey = target.getAttribute("data-node");
  if (nodeKey != null) {
    return { type: "node", key: nodeKey };
  }
  const linkKey = target.getAttribute("data-link");
  return linkKey != null ? { type: "link", key: linkKey } : null;
}

function getColorLabel(
  color: FlowColor,
  colorColumn: DatasetColumn,
  settings: ComputedVisualizationSettings,
): string {
  return color.isEnded
    ? t`Ended before this step`
    : formatDimension(color.value, colorColumn, settings);
}

type HoverContentOptions = {
  target: FlowTarget;
  model: FlowModel;
  columns: FlowColumns;
  settings: ComputedVisualizationSettings;
  colorsByKey: Map<string, string>;
  colorLabels: Map<string, string>;
};

function getHoverContent({
  target,
  model,
  columns,
  settings,
  colorsByKey,
  colorLabels,
}: HoverContentOptions): Pick<
  HoveredObject,
  "data" | "footerData" | "stackedTooltipModel"
> {
  const valueColumn = columns.value.column;
  const formatter = (value: unknown) =>
    typeof value === "number"
      ? formatMetric(value, valueColumn, settings, { compact: false })
      : String(value);

  if (target.type === "node") {
    const node = model.nodesByKey.get(target.key);
    if (node == null) {
      return {};
    }
    const stepColumn = columns.steps[node.stepIndex].column;
    return {
      stackedTooltipModel: {
        headerTitle: `${stepColumn.display_name}: ${formatDimension(node.value, stepColumn, settings)}`,
        headerRows: [],
        bodyRows: Array.from(node.totalsByColor.entries()).map(
          ([colorKey, value]) => ({
            name: colorLabels.get(colorKey) ?? "",
            value,
            color: colorsByKey.get(colorKey),
            formatter,
          }),
        ),
        totalFormatter: formatter,
        showTotal: true,
        showPercentages: true,
        grandTotal: model.total,
      },
    };
  }

  const link = model.linksByKey.get(target.key);
  const source = link ? model.nodesByKey.get(link.sourceKey) : undefined;
  const linkTarget = link ? model.nodesByKey.get(link.targetKey) : undefined;
  if (link == null || source == null || linkTarget == null) {
    return {};
  }
  const sourceColumn = columns.steps[source.stepIndex].column;
  const targetColumn = columns.steps[linkTarget.stepIndex].column;
  const colorColumn = columns.steps[columns.colorStepIndex].column;
  const isColorShown =
    columns.colorStepIndex !== source.stepIndex &&
    columns.colorStepIndex !== linkTarget.stepIndex;

  return {
    data: [
      {
        key: sourceColumn.display_name,
        value: source.value,
        col: sourceColumn,
      },
      {
        key: targetColumn.display_name,
        value: linkTarget.value,
        col: targetColumn,
      },
      ...(isColorShown
        ? [
            {
              key: colorColumn.display_name,
              value: colorLabels.get(link.colorKey) ?? "",
              col: null,
            },
          ]
        : []),
      { key: valueColumn.display_name, value: link.value, col: valueColumn },
    ],
    footerData: [
      {
        key: t`Share of ${formatDimension(source.value, sourceColumn, settings)}`,
        value: formatShare(link.value / source.total),
        col: null,
      },
      {
        key: t`Share of all journeys`,
        value: formatShare(link.value / model.total),
        col: null,
      },
    ],
  };
}

function getNodeClickObject(
  nodeKey: string,
  model: FlowModel,
  columns: FlowColumns,
  settings: ComputedVisualizationSettings,
): ClickObject | null {
  const node = model.nodesByKey.get(nodeKey);
  if (node == null) {
    return null;
  }
  return {
    value: node.total,
    column: columns.value.column,
    dimensions: [
      { value: node.value, column: columns.steps[node.stepIndex].column },
    ],
    settings,
  };
}

function getLinkClickObject(
  linkKey: string,
  model: FlowModel,
  columns: FlowColumns,
  settings: ComputedVisualizationSettings,
): ClickObject | null {
  const link = model.linksByKey.get(linkKey);
  const source = link ? model.nodesByKey.get(link.sourceKey) : undefined;
  const target = link ? model.nodesByKey.get(link.targetKey) : undefined;
  if (link == null || source == null || target == null) {
    return null;
  }
  return {
    value: link.value,
    column: columns.value.column,
    dimensions: [
      { value: source.value, column: columns.steps[source.stepIndex].column },
      { value: target.value, column: columns.steps[target.stepIndex].column },
    ],
    settings,
  };
}

export const MaFlow = assignLazily(MaFlowComponent, MA_FLOW_DEFINITION);
