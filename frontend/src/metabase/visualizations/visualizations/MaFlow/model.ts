import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import { type AxisItem, getAxisKey } from "../MaShared/axis";
import { type ChartColumn, findChartColumn } from "../MaShared/columns";

import {
  ENDED_COLOR_KEY,
  type FlowNodeOrder,
  MAX_FLOW_STEPS,
  MIN_FLOW_STEPS,
} from "./constants";
import type { FlowColumnNames } from "./settings";

export type FlowColumn = ChartColumn;

export type FlowColumns = {
  steps: FlowColumn[];
  value: FlowColumn;
  colorStepIndex: number;
};

export type FlowNode = AxisItem & {
  stepIndex: number;
  total: number;
  totalsByColor: Map<string, number>;
};

export type FlowLink = {
  key: string;
  sourceKey: string;
  targetKey: string;
  colorKey: string;
  value: number;
};

export type FlowJourney = {
  nodeKeys: string[];
  colorKey: string;
  value: number;
};

export type FlowColor = {
  key: string;
  value: RowValue;
  isEnded: boolean;
};

export type FlowModel = {
  steps: FlowNode[][];
  nodesByKey: Map<string, FlowNode>;
  links: FlowLink[];
  linksByKey: Map<string, FlowLink>;
  journeys: FlowJourney[];
  colors: FlowColor[];
  total: number;
  skippedRowCount: number;
  skippedStepRowCount: number;
};

export type FlowSize = {
  nodeCount: number;
  linkCount: number;
  hasValues: boolean;
};

export type FlowTarget =
  | { type: "node"; key: string }
  | { type: "link"; key: string };

type JourneyDraft = {
  values: RowValue[];
  colorValue: RowValue | undefined;
  value: number;
  skipsAStep: boolean;
};

/**
 * Resolves the step, value and color-by columns of a flow chart.
 * Returns `null` unless there are at least two distinct steps, no more than
 * the maximum, and a value column that isn't one of the steps. When the
 * color-by column isn't one of the steps, bands are colored by the first step.
 */
export function getFlowColumns(
  cols: DatasetColumn[],
  names: FlowColumnNames,
): FlowColumns | null {
  const uniqueStepNames = Array.from(new Set(names.steps));
  const steps = uniqueStepNames
    .map((name) => findChartColumn(cols, name))
    .filter((step): step is FlowColumn => step != null);
  const value = findChartColumn(cols, names.value);

  if (
    value == null ||
    steps.length < MIN_FLOW_STEPS ||
    steps.length > MAX_FLOW_STEPS ||
    steps.length !== uniqueStepNames.length ||
    steps.some((step) => step.index === value.index)
  ) {
    return null;
  }

  const colorStepIndex = steps.findIndex(
    (step) => step.column.name === names.colorBy,
  );
  return { steps, value, colorStepIndex: Math.max(0, colorStepIndex) };
}

const flowSizeCache = new WeakMap<RowValues[], Map<string, FlowSize>>();

/**
 * Counts the nodes and bands the chart would draw, and whether any row has a
 * positive value to draw. Metabase checks this on every render, hovers
 * included, so the count is kept for each result and set of columns.
 */
export function getFlowSize(rows: RowValues[], columns: FlowColumns): FlowSize {
  const columnsKey = JSON.stringify([
    columns.steps.map((step) => step.index),
    columns.value.index,
    columns.colorStepIndex,
  ]);
  const sizesByColumns = flowSizeCache.get(rows) ?? new Map<string, FlowSize>();
  const cachedSize = sizesByColumns.get(columnsKey);
  if (cachedSize != null) {
    return cachedSize;
  }

  const size = countFlowSize(rows, columns);
  sizesByColumns.set(columnsKey, size);
  flowSizeCache.set(rows, sizesByColumns);
  return size;
}

function countFlowSize(rows: RowValues[], columns: FlowColumns): FlowSize {
  const nodeKeys = new Set<string>();
  const linkKeys = new Set<string>();
  let hasValues = false;

  for (const row of rows) {
    const journey = getJourneyDraft(row, columns);
    if (journey == null) {
      continue;
    }
    hasValues = true;
    const keys = journey.values.map((value, stepIndex) =>
      getNodeKey(stepIndex, getAxisKey(value)),
    );
    const colorKey = getJourneyColorKey(journey);
    keys.forEach((key, position) => {
      nodeKeys.add(key);
      if (position > 0) {
        linkKeys.add(getLinkKey(keys[position - 1], key, colorKey));
      }
    });
  }

  return { nodeCount: nodeKeys.size, linkCount: linkKeys.size, hasValues };
}

/**
 * Turns the result rows into journeys through the steps.
 *
 * Each row is one journey, weighted by its value. A journey ends at the first
 * empty step after the first one, so a funnel can show where people drop
 * out; rows with a filled step after that are counted in
 * `skippedStepRowCount`. Rows with an empty, zero or negative value are
 * skipped and counted in `skippedRowCount`. Bands are colored by the
 * journey's value at the color-by step, or marked as ended when the journey
 * stopped before it. Each step's values keep the order they first appear in,
 * or go largest first.
 */
export function getFlowModel(
  rows: RowValues[],
  columns: FlowColumns,
  { nodeOrder }: { nodeOrder: FlowNodeOrder },
): FlowModel {
  const nodesByKey = new Map<string, FlowNode>();
  const linksByKey = new Map<string, FlowLink>();
  const colorValues = new Map<string, RowValue>();
  const journeys: FlowJourney[] = [];
  let total = 0;
  let skippedRowCount = 0;
  let skippedStepRowCount = 0;

  for (const row of rows) {
    const draft = getJourneyDraft(row, columns);
    if (draft == null) {
      skippedRowCount += 1;
      continue;
    }
    skippedStepRowCount += draft.skipsAStep ? 1 : 0;

    const colorKey = getJourneyColorKey(draft);
    if (!colorValues.has(colorKey)) {
      colorValues.set(colorKey, draft.colorValue ?? null);
    }

    const nodeKeys = draft.values.map((value, stepIndex) =>
      addToNode(nodesByKey, {
        stepIndex,
        value,
        colorKey,
        amount: draft.value,
      }),
    );
    nodeKeys.slice(1).forEach((targetKey, position) => {
      addToLink(
        linksByKey,
        nodeKeys[position],
        targetKey,
        colorKey,
        draft.value,
      );
    });

    journeys.push({ nodeKeys, colorKey, value: draft.value });
    total += draft.value;
  }

  const nodesInQueryOrder: FlowNode[][] = columns.steps.map(() => []);
  for (const node of nodesByKey.values()) {
    nodesInQueryOrder[node.stepIndex].push(node);
  }
  const steps = nodesInQueryOrder.map((nodes) => orderNodes(nodes, nodeOrder));

  return {
    steps,
    nodesByKey,
    links: Array.from(linksByKey.values()),
    linksByKey,
    journeys,
    colors: orderColors(colorValues, steps[columns.colorStepIndex]),
    total,
    skippedRowCount,
    skippedStepRowCount,
  };
}

/**
 * Adds up, for every band, how much of it belongs to the journeys that pass
 * through the given node or band.
 */
export function getTracedLinkValues(
  model: FlowModel,
  target: FlowTarget,
): Map<string, number> {
  const isTraced = getJourneyFilter(model, target);
  const tracedValues = new Map<string, number>();

  for (const journey of model.journeys) {
    if (!isTraced(journey)) {
      continue;
    }
    journey.nodeKeys.slice(1).forEach((targetKey, position) => {
      const key = getLinkKey(
        journey.nodeKeys[position],
        targetKey,
        journey.colorKey,
      );
      tracedValues.set(key, (tracedValues.get(key) ?? 0) + journey.value);
    });
  }

  return tracedValues;
}

function getJourneyFilter(
  model: FlowModel,
  target: FlowTarget,
): (journey: FlowJourney) => boolean {
  if (target.type === "node") {
    return (journey) => journey.nodeKeys.includes(target.key);
  }
  const link = model.linksByKey.get(target.key);
  if (link == null) {
    return () => false;
  }
  return (journey) =>
    journey.colorKey === link.colorKey &&
    journey.nodeKeys.some(
      (key, position) =>
        key === link.sourceKey &&
        journey.nodeKeys[position + 1] === link.targetKey,
    );
}

function getJourneyDraft(
  row: RowValues,
  columns: FlowColumns,
): JourneyDraft | null {
  const value = row[columns.value.index];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const stepValues = columns.steps.map((step) => row[step.index]);
  const end = stepValues.findIndex(
    (stepValue, stepIndex) => stepIndex > 0 && stepValue === null,
  );
  const values = end >= 0 ? stepValues.slice(0, end) : stepValues;

  return {
    values,
    colorValue:
      columns.colorStepIndex < values.length
        ? values[columns.colorStepIndex]
        : undefined,
    value,
    skipsAStep:
      end >= 0 && stepValues.slice(end).some((stepValue) => stepValue !== null),
  };
}

function getJourneyColorKey(journey: JourneyDraft): string {
  return journey.colorValue === undefined
    ? ENDED_COLOR_KEY
    : getValueColorKey(journey.colorValue);
}

/**
 * The color of the bands of journeys that have this value at the color-by
 * step, and of that value's own box.
 */
export function getValueColorKey(value: RowValue): string {
  return getAxisKey(value);
}

/**
 * The identity of a node: a value at a given step.
 */
export function getNodeKey(stepIndex: number, axisKey: string): string {
  return JSON.stringify([stepIndex, axisKey]);
}

/**
 * The identity of a band: a hop between two nodes, for one color.
 */
export function getLinkKey(
  sourceKey: string,
  targetKey: string,
  colorKey: string,
): string {
  return JSON.stringify([sourceKey, targetKey, colorKey]);
}

type NodeContribution = {
  stepIndex: number;
  value: RowValue;
  colorKey: string;
  amount: number;
};

function addToNode(
  nodesByKey: Map<string, FlowNode>,
  { stepIndex, value, colorKey, amount }: NodeContribution,
): string {
  const key = getNodeKey(stepIndex, getAxisKey(value));
  const node = nodesByKey.get(key) ?? {
    key,
    value,
    stepIndex,
    total: 0,
    totalsByColor: new Map<string, number>(),
  };
  node.total += amount;
  node.totalsByColor.set(
    colorKey,
    (node.totalsByColor.get(colorKey) ?? 0) + amount,
  );
  nodesByKey.set(key, node);
  return key;
}

function addToLink(
  linksByKey: Map<string, FlowLink>,
  sourceKey: string,
  targetKey: string,
  colorKey: string,
  amount: number,
) {
  const key = getLinkKey(sourceKey, targetKey, colorKey);
  const link = linksByKey.get(key) ?? {
    key,
    sourceKey,
    targetKey,
    colorKey,
    value: 0,
  };
  link.value += amount;
  linksByKey.set(key, link);
}

function orderNodes(
  nodesInQueryOrder: FlowNode[],
  nodeOrder: FlowNodeOrder,
): FlowNode[] {
  if (nodeOrder === "query") {
    return nodesInQueryOrder;
  }
  return nodesInQueryOrder
    .map((node, position) => ({ node, position }))
    .sort(
      (left, right) =>
        right.node.total - left.node.total || left.position - right.position,
    )
    .map(({ node }) => node);
}

function orderColors(
  colorValues: Map<string, RowValue>,
  colorStepNodes: FlowNode[],
): FlowColor[] {
  const nodeOrder = colorStepNodes.map((node) => getValueColorKey(node.value));
  return Array.from(colorValues.entries())
    .map(([key, value]) => ({ key, value, isEnded: key === ENDED_COLOR_KEY }))
    .sort(
      (left, right) =>
        getColorRank(left, nodeOrder) - getColorRank(right, nodeOrder),
    );
}

function getColorRank(color: FlowColor, nodeOrder: string[]): number {
  if (color.isEnded) {
    return Number.MAX_SAFE_INTEGER;
  }
  const rank = nodeOrder.indexOf(color.key);
  return rank >= 0 ? rank : nodeOrder.length;
}
