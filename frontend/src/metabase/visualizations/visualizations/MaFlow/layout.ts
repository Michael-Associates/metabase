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

export const FLOW_NODE_WIDTH = 12;

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
 * scale, and every band between them. Labels sit left of the first step and
 * right of every other step; a label that has no room is shortened with an
 * ellipsis or left out, and its node keeps its tooltip.
 */
export function getFlowLayout(options: FlowLayoutOptions): FlowLayout {
  const { height, model, fontSize } = options;
  const lastStep = model.steps.length - 1;
  const columns = getColumns(options);

  const plotTop = OUTER_PADDING + fontSize + TITLE_GAP;
  const plotHeight = Math.max(0, height - plotTop - OUTER_PADDING);
  const nodeGap = getNodeGap(model, plotHeight);
  const scale = getScale(model, plotHeight, nodeGap);

  const nodes = new Map<string, FlowRect>();
  model.steps.forEach((stepNodes, stepIndex) => {
    let y = plotTop;
    for (const node of stepNodes) {
      const nodeHeight = Math.max(MIN_NODE_HEIGHT, node.total * scale);
      nodes.set(node.key, {
        x: columns.getX(stepIndex),
        y,
        width: FLOW_NODE_WIDTH,
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
    stepTitles: options.stepTitles.map((text, stepIndex) => {
      const isFirstStep = stepIndex === 0;
      const x = isFirstStep
        ? columns.getX(stepIndex) + FLOW_NODE_WIDTH
        : columns.getX(stepIndex);
      return {
        x,
        y: OUTER_PADDING + fontSize,
        anchor: isFirstStep ? "end" : "start",
        text: truncateLabel(
          text,
          columns.getTitleWidth(stepIndex, stepIndex === lastStep),
          options.measureBoldText,
        ),
      };
    }),
    scale,
  };
}

type Columns = {
  getX: (stepIndex: number) => number;
  getLabelWidth: (stepIndex: number) => number;
  getTitleWidth: (stepIndex: number, isLastStep: boolean) => number;
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
  const right = Math.max(
    left + FLOW_NODE_WIDTH,
    width - OUTER_PADDING - rightLabelWidth - LABEL_GAP,
  );
  const spacing = (right - left - FLOW_NODE_WIDTH) / Math.max(1, lastStep);
  const middleLabelWidth = Math.max(
    0,
    spacing - FLOW_NODE_WIDTH - LABEL_GAP * 2,
  );

  return {
    getX: (stepIndex) => left + stepIndex * spacing,
    getLabelWidth: (stepIndex) => {
      if (stepIndex === 0) {
        return leftLabelWidth;
      }
      return stepIndex === lastStep ? rightLabelWidth : middleLabelWidth;
    },
    getTitleWidth: (stepIndex, isLastStep) => {
      if (stepIndex === 0) {
        return leftLabelWidth + LABEL_GAP + FLOW_NODE_WIDTH;
      }
      return isLastStep
        ? rightLabelWidth + LABEL_GAP + FLOW_NODE_WIDTH
        : Math.max(0, spacing - LABEL_GAP);
    },
  };
}

function getNodeGap(model: FlowModel, plotHeight: number): number {
  const largestStep = Math.max(...model.steps.map((nodes) => nodes.length));
  if (largestStep <= 1) {
    return 0;
  }
  const gapCount = largestStep - 1;
  const preferredGap = Math.min(
    MAX_NODE_GAP,
    Math.max(MIN_NODE_GAP, (plotHeight * NODE_GAP_SHARE) / gapCount),
  );
  return Math.min(preferredGap, (plotHeight * MAX_GAP_SHARE) / gapCount);
}

function getScale(
  model: FlowModel,
  plotHeight: number,
  nodeGap: number,
): number {
  const stepScales = model.steps
    .map((nodes) => {
      const total = nodes.reduce((sum, node) => sum + node.total, 0);
      const room = plotHeight - nodeGap * Math.max(0, nodes.length - 1);
      return total > 0 ? Math.max(0, room) / total : null;
    })
    .filter((stepScale): stepScale is number => stepScale != null);
  return stepScales.length > 0 ? Math.min(...stepScales) : 0;
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
