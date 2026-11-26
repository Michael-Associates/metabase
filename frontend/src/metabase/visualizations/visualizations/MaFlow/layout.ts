import { type MeasureText, truncateLabel } from "../MaShared/text";

import type { FlowLink, FlowModel, FlowNode } from "./model";

export type FlowNodeText = {
  name: string;
  detail: string | null;
};

export type FlowLayoutOptions = {
  width: number;
  height: number;
  model: FlowModel;
  stepTitles: string[];
  nodeTexts: Map<string, FlowNodeText>;
  colorOrder: string[];
  fontSize: number;
  measureText: MeasureText;
  measureBoldText: MeasureText;
};

export type FlowRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FlowBand = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  width: number;
};

export type FlowTextAnchor = "start" | "end";

export type FlowLabel = {
  x: number;
  y: number;
  anchor: FlowTextAnchor;
  name: string | null;
  detail: string | null;
};

export type FlowStepTitle = {
  x: number;
  y: number;
  anchor: FlowTextAnchor;
  text: string;
};

export type FlowLayout = {
  nodes: Map<string, FlowRect>;
  bands: Map<string, FlowBand>;
  labels: Map<string, FlowLabel>;
  stepTitles: FlowStepTitle[];
  scale: number;
};

/** Letter spacing of the step titles, in em. */
export const FLOW_TITLE_LETTER_SPACING = 0.04;

const NODE_WIDTH = 12;
const MIN_NODE_WIDTH = 2;
const OUTER_PADDING = 8;
const LABEL_GAP = 8;
const TITLE_GAP = 14;
const MAX_SIDE_LABEL_SHARE = 0.22;
const NODE_GAP_SHARE = 0.3;
const MAX_GAP_SHARE = 0.5;
const MIN_NODE_GAP = 4;
const MAX_NODE_GAP = 24;
const MIN_NODE_HEIGHT = 2;
const NAME_ROOM_IN_LINES = 1.2;
const DETAIL_ROOM_IN_LINES = 2.4;

/**
 * Places the steps as columns from left to right, each step's nodes stacked
 * from the top with heights proportional to their totals on one shared
 * scale, and every band between them. Tiny nodes are drawn at a minimum
 * height that the scale makes room for, so every node stays inside the
 * space. Labels sit left of the first step and right of every other step; a
 * label that has no room is shortened with an ellipsis or left out, and its
 * node keeps its tooltip. Step titles are uppercase.
 */
export function getFlowLayout(options: FlowLayoutOptions): FlowLayout {
  const { height, model, fontSize } = options;
  const columns = getColumns(options);

  const plotTop = OUTER_PADDING + fontSize + TITLE_GAP;
  const plotHeight = Math.max(0, height - plotTop - OUTER_PADDING);
  const largestStep = Math.max(0, ...model.steps.map((nodes) => nodes.length));
  const minNodeHeight =
    largestStep > 0
      ? Math.min(MIN_NODE_HEIGHT, plotHeight / largestStep)
      : MIN_NODE_HEIGHT;
  const nodeGap = getNodeGap(largestStep, plotHeight, minNodeHeight);
  const scale = getScale(model, plotHeight, nodeGap, minNodeHeight);

  const nodes = new Map<string, FlowRect>();
  model.steps.forEach((stepNodes, stepIndex) => {
    let y = plotTop;
    for (const node of stepNodes) {
      const nodeHeight = Math.max(minNodeHeight, node.total * scale);
      nodes.set(node.key, {
        x: columns.getX(stepIndex),
        y,
        width: columns.nodeWidth,
        height: nodeHeight,
      });
      y += nodeHeight + nodeGap;
    }
  });

  const labels = new Map<string, FlowLabel>();
  for (const node of model.nodesByKey.values()) {
    const rect = nodes.get(node.key);
    const label =
      rect != null
        ? getNodeLabel({
            node,
            rect,
            room: rect.height + nodeGap,
            maxWidth: columns.getLabelWidth(node.stepIndex),
            isFirstStep: node.stepIndex === 0,
            options,
          })
        : null;
    if (label != null) {
      labels.set(node.key, label);
    }
  }

  return {
    nodes,
    bands: getBands(model, nodes, options.colorOrder, scale),
    labels,
    stepTitles: getStepTitles(options, columns),
    scale,
  };
}

type Columns = {
  nodeWidth: number;
  getX: (stepIndex: number) => number;
  getLabelWidth: (stepIndex: number) => number;
  getTitleWidth: (stepIndex: number) => number;
};

function getColumns({
  width,
  model,
  nodeTexts,
  measureText,
  measureBoldText,
}: FlowLayoutOptions): Columns {
  const lastStep = model.steps.length - 1;
  const sideLimit = width * MAX_SIDE_LABEL_SHARE;
  const getWidestLabel = (nodes: FlowNode[]) =>
    nodes.reduce((widest, node) => {
      const text = nodeTexts.get(node.key);
      if (text == null) {
        return widest;
      }
      const detailWidth = text.detail != null ? measureText(text.detail) : 0;
      return Math.max(widest, measureBoldText(text.name), detailWidth);
    }, 0);

  const leftLabelWidth = Math.min(getWidestLabel(model.steps[0]), sideLimit);
  const rightLabelWidth = Math.min(
    getWidestLabel(model.steps[lastStep]),
    sideLimit,
  );
  const left = OUTER_PADDING + leftLabelWidth + LABEL_GAP;
  const plotWidth = Math.max(
    0,
    width - OUTER_PADDING - rightLabelWidth - LABEL_GAP - left,
  );
  // Narrow charts get thinner nodes, so each node is at most half the space
  // between two steps and the bands between them stay visible.
  const nodeWidth = Math.max(
    MIN_NODE_WIDTH,
    Math.min(NODE_WIDTH, plotWidth / (2 * lastStep + 1)),
  );
  const spacing = Math.max(0, plotWidth - nodeWidth) / Math.max(1, lastStep);
  const middleLabelWidth = Math.max(0, spacing - nodeWidth - LABEL_GAP * 2);

  return {
    nodeWidth,
    getX: (stepIndex) => left + stepIndex * spacing,
    getLabelWidth: (stepIndex) => {
      if (stepIndex === 0) {
        return leftLabelWidth;
      }
      return stepIndex === lastStep ? rightLabelWidth : middleLabelWidth;
    },
    getTitleWidth: (stepIndex) => {
      if (stepIndex === 0) {
        return leftLabelWidth + LABEL_GAP + nodeWidth;
      }
      return stepIndex === lastStep
        ? rightLabelWidth + LABEL_GAP + nodeWidth
        : Math.max(0, spacing - LABEL_GAP);
    },
  };
}

function getNodeGap(
  largestStep: number,
  plotHeight: number,
  minNodeHeight: number,
): number {
  if (largestStep <= 1) {
    return 0;
  }
  const gapCount = largestStep - 1;
  const preferredGap = Math.min(
    MAX_NODE_GAP,
    Math.max(MIN_NODE_GAP, (plotHeight * NODE_GAP_SHARE) / gapCount),
  );
  const roomForGaps = Math.max(0, plotHeight - largestStep * minNodeHeight);
  return Math.min(
    preferredGap,
    (plotHeight * MAX_GAP_SHARE) / gapCount,
    roomForGaps / gapCount,
  );
}

function getScale(
  model: FlowModel,
  plotHeight: number,
  nodeGap: number,
  minNodeHeight: number,
): number {
  const stepScales = model.steps
    .filter((nodes) => nodes.length > 0)
    .map((nodes) =>
      getStepScale(
        nodes.map((node) => node.total),
        plotHeight - nodeGap * (nodes.length - 1),
        minNodeHeight,
      ),
    );
  return stepScales.length > 0 ? Math.min(...stepScales) : 0;
}

/**
 * The largest scale at which a step's nodes fill its room, with the nodes too
 * small to see raised to the minimum height. Raising a node leaves less room
 * for the rest, which can push the next smallest node under the minimum, so
 * nodes are raised from the smallest up until the rest are tall enough.
 */
function getStepScale(
  totals: number[],
  room: number,
  minNodeHeight: number,
): number {
  const ascending = [...totals].sort((left, right) => left - right);
  let restTotal = ascending.reduce((sum, total) => sum + total, 0);
  let scale = 0;
  for (const [raisedCount, total] of ascending.entries()) {
    if (restTotal <= 0) {
      break;
    }
    scale = Math.max(0, room - raisedCount * minNodeHeight) / restTotal;
    if (total * scale >= minNodeHeight) {
      break;
    }
    restTotal -= total;
  }
  return scale;
}

function getStepTitles(
  options: FlowLayoutOptions,
  columns: Columns,
): FlowStepTitle[] {
  const { fontSize, measureBoldText } = options;
  const letterSpacing = FLOW_TITLE_LETTER_SPACING * fontSize;
  const measureTitle = (text: string) =>
    measureBoldText(text) + text.length * letterSpacing;

  return options.stepTitles.map((title, stepIndex) => {
    const isFirstStep = stepIndex === 0;
    return {
      x: isFirstStep
        ? columns.getX(stepIndex) + columns.nodeWidth
        : columns.getX(stepIndex),
      y: OUTER_PADDING + fontSize,
      anchor: isFirstStep ? "end" : "start",
      text: truncateLabel(
        title.toLocaleUpperCase(),
        columns.getTitleWidth(stepIndex),
        measureTitle,
      ),
    };
  });
}

function getBands(
  model: FlowModel,
  nodes: Map<string, FlowRect>,
  colorOrder: string[],
  scale: number,
): Map<string, FlowBand> {
  const nodeRanks = new Map<string, number>();
  model.steps.forEach((stepNodes) =>
    stepNodes.forEach((node, rank) => nodeRanks.set(node.key, rank)),
  );
  const colorRanks = new Map(colorOrder.map((key, rank) => [key, rank]));
  const rankOf = (ranks: Map<string, number>, key: string) =>
    ranks.get(key) ?? Number.MAX_SAFE_INTEGER;

  const sourceY = stackLinks(
    model.links,
    nodes,
    (link) => link.sourceKey,
    (left, right) =>
      rankOf(nodeRanks, left.targetKey) - rankOf(nodeRanks, right.targetKey) ||
      rankOf(colorRanks, left.colorKey) - rankOf(colorRanks, right.colorKey),
    scale,
  );
  const targetY = stackLinks(
    model.links,
    nodes,
    (link) => link.targetKey,
    (left, right) =>
      rankOf(nodeRanks, left.sourceKey) - rankOf(nodeRanks, right.sourceKey) ||
      rankOf(colorRanks, left.colorKey) - rankOf(colorRanks, right.colorKey),
    scale,
  );

  const bands = new Map<string, FlowBand>();
  for (const link of model.links) {
    const source = nodes.get(link.sourceKey);
    const target = nodes.get(link.targetKey);
    const bandSourceY = sourceY.get(link.key);
    const bandTargetY = targetY.get(link.key);
    if (
      source == null ||
      target == null ||
      bandSourceY == null ||
      bandTargetY == null
    ) {
      continue;
    }
    bands.set(link.key, {
      sourceX: source.x + source.width,
      sourceY: bandSourceY,
      targetX: target.x,
      targetY: bandTargetY,
      width: link.value * scale,
    });
  }
  return bands;
}

function stackLinks(
  links: FlowLink[],
  nodes: Map<string, FlowRect>,
  getNodeKey: (link: FlowLink) => string,
  compare: (left: FlowLink, right: FlowLink) => number,
  scale: number,
): Map<string, number> {
  const linksByNode = new Map<string, FlowLink[]>();
  for (const link of links) {
    const key = getNodeKey(link);
    linksByNode.set(key, [...(linksByNode.get(key) ?? []), link]);
  }

  const positions = new Map<string, number>();
  for (const [nodeKey, nodeLinks] of linksByNode) {
    let y = nodes.get(nodeKey)?.y ?? 0;
    for (const link of [...nodeLinks].sort(compare)) {
      positions.set(link.key, y);
      y += link.value * scale;
    }
  }
  return positions;
}

type NodeLabelOptions = {
  node: FlowNode;
  rect: FlowRect;
  room: number;
  maxWidth: number;
  isFirstStep: boolean;
  options: FlowLayoutOptions;
};

function getNodeLabel({
  node,
  rect,
  room,
  maxWidth,
  isFirstStep,
  options,
}: NodeLabelOptions): FlowLabel | null {
  const text = options.nodeTexts.get(node.key);
  const { fontSize, measureText, measureBoldText } = options;
  if (text == null || room < fontSize * NAME_ROOM_IN_LINES) {
    return null;
  }

  const name = truncateLabel(text.name, maxWidth, measureBoldText);
  const detail =
    text.detail != null && room >= fontSize * DETAIL_ROOM_IN_LINES
      ? truncateLabel(text.detail, maxWidth, measureText)
      : "";
  if (name === "") {
    return null;
  }

  return {
    x: isFirstStep ? rect.x - LABEL_GAP : rect.x + rect.width + LABEL_GAP,
    y: rect.y + rect.height / 2,
    anchor: isFirstStep ? "end" : "start",
    name,
    detail: detail === "" ? null : detail,
  };
}
