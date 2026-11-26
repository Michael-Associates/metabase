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
import type { ClickObjectDimension } from "metabase-lib";
import type { DatasetColumn } from "metabase-types/api";

import { formatDimension, formatMetric, formatShare } from "../MaShared/format";
import { useContainerSize } from "../MaShared/use-container-size";

import { MA_FLOW_DEFINITION } from "./definition";
import {
  FLOW_TITLE_LETTER_SPACING,
  type FlowBand,
  type FlowLayout,
  type FlowNodeText,
  getFlowLayout,
} from "./layout";
import {
  type FlowColor,
  type FlowColumns,
  type FlowLink,
  type FlowModel,
  type FlowTarget,
  getFlowColumns,
  getFlowModel,
  getTracedLinkValues,
  getValueColorKey,
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

  const warnings = useMemo(() => getWarnings(model), [model]);
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

function getWarnings(model: FlowModel | null): string[] {
  const warnings: string[] = [];
  if (model != null && model.skippedRowCount > 0) {
    warnings.push(t`Rows with an empty, zero or negative size aren't drawn.`);
  }
  if (model != null && model.skippedStepRowCount > 0) {
    warnings.push(
      t`Some rows have an empty step before a filled one. Their journeys are drawn only up to the empty step.`,
    );
  }
  return warnings;
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

type HoveredTarget = {
  model: FlowModel;
  target: FlowTarget;
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
  const [hovered, setHovered] = useState<HoveredTarget | null>(null);
  // A trace belongs to the model it was made on, so it ends when the data or
  // settings change.
  const tracedTarget = hovered?.model === model ? hovered.target : null;

  const { showValues, showLegend } = getFlowDisplayOptions(settings);
  const fontSize = renderingContext.theme.cartesian.label.fontSize;
  const colorColumn = columns.steps[columns.colorStepIndex].column;
  const numberSeparators = settings.column?.(
    columns.value.column,
  )?.number_separators;

  const { colorLabels, colorsByKey } = useFlowColors({
    model,
    colorColumn,
    settings,
    renderingContext,
  });
  const nodeTexts = useMemo(
    () =>
      getNodeTexts({ model, columns, settings, showValues, numberSeparators }),
    [model, columns, settings, showValues, numberSeparators],
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

  const handleMouseLeave = useCallback(() => {
    setHovered(null);
    onHoverChange(null);
  }, [onHoverChange]);

  const handleMouseOver = (event: ReactMouseEvent<SVGSVGElement>) => {
    const target = getFlowTargetOfElement(event.target);
    if (target == null || !(event.target instanceof Element)) {
      handleMouseLeave();
      return;
    }
    setHovered({ model, target });
    onHoverChange({
      element: event.target,
      ...getHoverContent({
        target,
        model,
        columns,
        settings,
        colorsByKey,
        colorLabels,
        numberSeparators,
      }),
    });
  };

  const handleClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    const target = getFlowTargetOfElement(event.target);
    if (target == null || !(event.target instanceof Element)) {
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
  };

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
            onMouseOver={handleMouseOver}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
          >
            <FlowBands
              model={model}
              columns={columns}
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
            <FlowNodes
              model={model}
              columns={columns}
              layout={layout}
              colorsByKey={colorsByKey}
              neutralColor={renderingContext.getColor("text-secondary")}
              isClickable={isClickable}
            />
            <FlowLabels
              layout={layout}
              fontSize={fontSize}
              renderingContext={renderingContext}
            />
            <FlowStepTitles
              layout={layout}
              fontSize={fontSize}
              renderingContext={renderingContext}
            />
          </svg>
        )}
      </Box>
    </Flex>
  );
}

type FlowColorsOptions = {
  model: FlowModel;
  colorColumn: DatasetColumn;
  settings: ComputedVisualizationSettings;
  renderingContext: RenderingContext;
};

/**
 * Names and colors every band color. Each color gets its own chart color,
 * even when two values format to the same name.
 */
function useFlowColors({
  model,
  colorColumn,
  settings,
  renderingContext,
}: FlowColorsOptions) {
  const palette = usePalette();
  const { getColor } = renderingContext;

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
    const names = getUniqueColorNames(
      model.colors.filter((color) => !color.isEnded),
      colorLabels,
    );
    const mapping = getColorsForValues(
      Array.from(names.values()),
      null,
      palette,
    );
    return new Map(
      model.colors.map((color) => [
        color.key,
        color.isEnded
          ? getColor("text-tertiary")
          : (mapping[names.get(color.key) ?? ""] ?? getColor("brand")),
      ]),
    );
  }, [model, colorLabels, palette, getColor]);

  return { colorLabels, colorsByKey };
}

function getUniqueColorNames(
  colors: FlowColor[],
  colorLabels: Map<string, string>,
): Map<string, string> {
  const usedNames = new Set<string>();
  return new Map(
    colors.map((color) => {
      const label = colorLabels.get(color.key) ?? "";
      let name = label;
      for (let copy = 2; usedNames.has(name); copy += 1) {
        name = `${label} (${copy})`;
      }
      usedNames.add(name);
      return [color.key, name];
    }),
  );
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

type NodeTextsOptions = {
  model: FlowModel;
  columns: FlowColumns;
  settings: ComputedVisualizationSettings;
  showValues: boolean;
  numberSeparators: string | undefined;
};

function getNodeTexts({
  model,
  columns,
  settings,
  showValues,
  numberSeparators,
}: NodeTextsOptions): Map<string, FlowNodeText> {
  return new Map(
    Array.from(model.nodesByKey.values()).map((node) => [
      node.key,
      {
        name: formatDimension(
          node.value,
          columns.steps[node.stepIndex].column,
          settings,
        ),
        detail: showValues
          ? `${formatMetric(node.total, columns.value.column, settings, { compact: true })} · ${formatShare(node.total / model.total, { numberSeparators })}`
          : null,
      },
    ]),
  );
}

type FlowBandsProps = {
  model: FlowModel;
  columns: FlowColumns;
  layout: FlowLayout;
  colorsByKey: Map<string, string>;
  opacity: number;
  isClickable: boolean;
};

const FlowBands = memo(function FlowBands({
  model,
  columns,
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
        const isDrillable =
          isClickable && getLinkColorDimension(link, model, columns) !== null;
        return (
          <path
            key={link.key}
            d={getBandPath(band, band.width)}
            fill={colorsByKey.get(link.colorKey)}
            fillOpacity={opacity}
            style={{
              transition: "fill-opacity 120ms",
              cursor: isDrillable ? "pointer" : "default",
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

type FlowNodesProps = {
  model: FlowModel;
  columns: FlowColumns;
  layout: FlowLayout;
  colorsByKey: Map<string, string>;
  neutralColor: string;
  isClickable: boolean;
};

/**
 * Draws a box for every value at every step. Boxes at the color-by step take
 * their value's color; the others are neutral.
 */
const FlowNodes = memo(function FlowNodes({
  model,
  columns,
  layout,
  colorsByKey,
  neutralColor,
  isClickable,
}: FlowNodesProps) {
  return (
    <g>
      {model.steps.flat().map((node) => {
        const rect = layout.nodes.get(node.key);
        if (rect == null) {
          return null;
        }
        const ownColor =
          node.stepIndex === columns.colorStepIndex
            ? colorsByKey.get(getValueColorKey(node.value))
            : undefined;
        return (
          <rect
            key={node.key}
            {...rect}
            rx={2}
            fill={ownColor ?? neutralColor}
            style={{ cursor: isClickable ? "pointer" : "default" }}
            data-node={node.key}
            data-testid="ma-flow-node"
          />
        );
      })}
    </g>
  );
});

type FlowTextsProps = {
  layout: FlowLayout;
  fontSize: number;
  renderingContext: RenderingContext;
};

function FlowLabels({ layout, fontSize, renderingContext }: FlowTextsProps) {
  const { getColor } = renderingContext;
  return (
    <g pointerEvents="none">
      {Array.from(layout.labels.entries()).map(([key, label]) => (
        <text
          key={key}
          x={label.x}
          y={label.y}
          textAnchor={label.anchor}
          fontSize={fontSize}
          fill={getColor("text-primary")}
          stroke={getColor("background-primary")}
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
    </g>
  );
}

function FlowStepTitles({
  layout,
  fontSize,
  renderingContext,
}: FlowTextsProps) {
  return (
    <g pointerEvents="none">
      {layout.stepTitles.map((title, stepIndex) => (
        <text
          key={stepIndex}
          x={title.x}
          y={title.y}
          textAnchor={title.anchor}
          fontSize={fontSize}
          fontWeight={TITLE_WEIGHT}
          letterSpacing={`${FLOW_TITLE_LETTER_SPACING}em`}
          fill={renderingContext.getColor("text-tertiary")}
          data-testid="ma-flow-step-title"
        >
          {title.text}
        </text>
      ))}
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

function getFlowTargetOfElement(target: EventTarget): FlowTarget | null {
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

type HoverContentOptions = {
  target: FlowTarget;
  model: FlowModel;
  columns: FlowColumns;
  settings: ComputedVisualizationSettings;
  colorsByKey: Map<string, string>;
  colorLabels: Map<string, string>;
  numberSeparators: string | undefined;
};

type HoverContent = Pick<
  HoveredObject,
  "data" | "footerData" | "stackedTooltipModel"
>;

function getHoverContent(options: HoverContentOptions): HoverContent {
  return options.target.type === "node"
    ? getNodeHoverContent(options.target.key, options)
    : getLinkHoverContent(options.target.key, options);
}

/**
 * A box made of several colors lists them, with the box's share of all
 * journeys on its total row. A box of one color has nothing to list, so it
 * shows its value and share instead.
 */
function getNodeHoverContent(
  nodeKey: string,
  {
    model,
    columns,
    settings,
    colorsByKey,
    colorLabels,
    numberSeparators,
  }: HoverContentOptions,
): HoverContent {
  const node = model.nodesByKey.get(nodeKey);
  if (node == null) {
    return {};
  }
  const stepColumn = columns.steps[node.stepIndex].column;
  const valueColumn = columns.value.column;

  if (node.totalsByColor.size > 1) {
    const formatter = (value: unknown) =>
      typeof value === "number"
        ? formatMetric(value, valueColumn, settings, { compact: false })
        : String(value);
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

  const [colorKey] = Array.from(node.totalsByColor.keys());
  const colorColumn = columns.steps[columns.colorStepIndex].column;
  return {
    data: [
      { key: stepColumn.display_name, value: node.value, col: stepColumn },
      ...(node.stepIndex !== columns.colorStepIndex
        ? [
            {
              key: colorColumn.display_name,
              value: colorLabels.get(colorKey) ?? "",
              col: null,
            },
          ]
        : []),
      { key: valueColumn.display_name, value: node.total, col: valueColumn },
    ],
    footerData: [
      {
        key: t`Share of all journeys`,
        value: formatShare(node.total / model.total, { numberSeparators }),
        col: null,
      },
    ],
  };
}

function getLinkHoverContent(
  linkKey: string,
  {
    model,
    columns,
    settings,
    colorLabels,
    numberSeparators,
  }: HoverContentOptions,
): HoverContent {
  const link = model.linksByKey.get(linkKey);
  const source = link ? model.nodesByKey.get(link.sourceKey) : undefined;
  const target = link ? model.nodesByKey.get(link.targetKey) : undefined;
  if (link == null || source == null || target == null) {
    return {};
  }
  const valueColumn = columns.value.column;
  const sourceColumn = columns.steps[source.stepIndex].column;
  const targetColumn = columns.steps[target.stepIndex].column;
  const colorColumn = columns.steps[columns.colorStepIndex].column;
  const isColorShown =
    columns.colorStepIndex !== source.stepIndex &&
    columns.colorStepIndex !== target.stepIndex;

  return {
    data: [
      {
        key: sourceColumn.display_name,
        value: source.value,
        col: sourceColumn,
      },
      {
        key: targetColumn.display_name,
        value: target.value,
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
        value: formatShare(link.value / source.total, { numberSeparators }),
        col: null,
      },
      {
        key: t`Share of all journeys`,
        value: formatShare(link.value / model.total, { numberSeparators }),
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

/**
 * A band is one color's part of a hop, so its records are the rows with the
 * hop's two values and, when the color-by step is another step, that step's
 * value too. Bands of journeys that ended before the color-by step can't be
 * told apart by values, so they have no records to show.
 */
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
  const colorDimension = getLinkColorDimension(link, model, columns);
  if (colorDimension === null) {
    return null;
  }
  const dimensions: ClickObjectDimension[] = [
    { value: source.value, column: columns.steps[source.stepIndex].column },
    { value: target.value, column: columns.steps[target.stepIndex].column },
  ];
  if (colorDimension !== undefined) {
    const position = columns.colorStepIndex < source.stepIndex ? 0 : 2;
    dimensions.splice(position, 0, colorDimension);
  }
  return {
    value: link.value,
    column: columns.value.column,
    dimensions,
    settings,
  };
}

/**
 * The color-by step's value a band's records must have: `undefined` when the
 * color-by step is one of the band's own steps, `null` when the band's
 * journeys ended before it.
 */
function getLinkColorDimension(
  link: FlowLink,
  model: FlowModel,
  columns: FlowColumns,
): ClickObjectDimension | null | undefined {
  const source = model.nodesByKey.get(link.sourceKey);
  const target = model.nodesByKey.get(link.targetKey);
  const { colorStepIndex } = columns;
  if (
    source == null ||
    target == null ||
    colorStepIndex === source.stepIndex ||
    colorStepIndex === target.stepIndex
  ) {
    return undefined;
  }
  const color = model.colors.find(
    (candidate) => candidate.key === link.colorKey,
  );
  if (color == null || color.isEnded) {
    return null;
  }
  return { value: color.value, column: columns.steps[colorStepIndex].column };
}

export const MaFlow = assignLazily(MaFlowComponent, MA_FLOW_DEFINITION);
