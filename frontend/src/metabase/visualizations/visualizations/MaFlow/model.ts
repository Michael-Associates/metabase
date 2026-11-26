import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";

import {
  type AxisItem,
  getAxisKey,
  getAxisSortOptions,
  sortAxisItems,
} from "../MaShared/axis";

import {
  ENDED_COLOR_KEY,
  MAX_FLOW_STEPS,
  MIN_FLOW_STEPS,
  type FlowNodeOrder,
} from "./constants";
import type { FlowColumnNames } from "./settings";

export type FlowColumn = {
  column: DatasetColumn;
  index: number;
};

export type FlowColumns = {
  steps: FlowColumn[];
  value: FlowColumn;
  colorStepIndex: number;
};

export type FlowNode = AxisItem & {
  stepIndex: number;
  total: number;
  endingTotal: number;
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
    .map((name) => findColumn(cols, name))
    .filter((step): step is FlowColumn => step != null);
  const value = findColumn(cols, names.value);

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

function findColumn(
  cols: DatasetColumn[],
  name: string | undefined,
): FlowColumn | null {
  if (name == null) {
    return null;
  }
  const index = cols.findIndex((col) => col.name === name);
  return index >= 0 ? { column: cols[index], index } : null;
}

/**
 * Counts the nodes and bands the chart would draw, and whether any row has a
 * positive value to draw.
 */
export function getFlowSize(rows: RowValues[], columns: FlowColumns): FlowSize {
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
    const colorKey = getColorKey(journey);
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
 * out. Rows with an empty, zero or negative value are skipped and counted in
 * `skippedRowCount`. Bands are colored by the journey's value at the color-by
 * step, or marked as ended when the journey stopped before it.
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

  for (const row of rows) {
    const draft = getJourneyDraft(row, columns);
    if (draft == null) {
      skippedRowCount += 1;
      continue;
    }

    const colorKey = getColorKey(draft);
    if (!colorValues.has(colorKey)) {
      colorValues.set(colorKey, draft.colorValue ?? null);
    }

    const nodeKeys = draft.values.map((value, stepIndex) =>
      addToNode(nodesByKey, {
        stepIndex,
        value,
        colorKey,
        amount: draft.value,
        isEnding:
          stepIndex === draft.values.length - 1 &&
          stepIndex < columns.steps.length - 1,
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

  const steps = columns.steps.map((step, stepIndex) =>
    orderNodes(
      Array.from(nodesByKey.values()).filter(
        (node) => node.stepIndex === stepIndex,
      ),
      step.column,
      nodeOrder,
    ),
  );

  return {
    steps,
    nodesByKey,
    links: Array.from(linksByKey.values()),
    linksByKey,
    journeys,
    colors: orderColors(colorValues, steps[columns.colorStepIndex]),
    total,
    skippedRowCount,
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

  const values: RowValue[] = [];
  for (const [stepIndex, step] of columns.steps.entries()) {
    const stepValue = row[step.index];
    if (stepIndex > 0 && stepValue === null) {
      break;
    }
    values.push(stepValue);
  }

  return {
    values,
    colorValue:
      columns.colorStepIndex < values.length
        ? values[columns.colorStepIndex]
        : undefined,
    value,
  };
}

function getColorKey(journey: JourneyDraft): string {
  return journey.colorValue === undefined
    ? ENDED_COLOR_KEY
    : getAxisKey(journey.colorValue);
}

/**
 * The identity of a node: a value at a given step.
 */
export function getNodeKey(stepIndex: number, axisKey: string): string {
  return JSON.stringify([stepIndex, axisKey]);
}

function getLinkKey(sourceKey: string, targetKey: string, colorKey: string) {
  return JSON.stringify([sourceKey, targetKey, colorKey]);
}

type NodeContribution = {
  stepIndex: number;
  value: RowValue;
  colorKey: string;
  amount: number;
  isEnding: boolean;
};

function addToNode(
  nodesByKey: Map<string, FlowNode>,
  { stepIndex, value, colorKey, amount, isEnding }: NodeContribution,
): string {
  const key = getNodeKey(stepIndex, getAxisKey(value));
  const node = nodesByKey.get(key) ?? {
    key,
    value,
    stepIndex,
    total: 0,
    endingTotal: 0,
    totalsByColor: new Map<string, number>(),
  };
  node.total += amount;
  node.endingTotal += isEnding ? amount : 0;
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
  nodes: FlowNode[],
  column: DatasetColumn,
  nodeOrder: FlowNodeOrder,
): FlowNode[] {
  const queryOrder = sortAxisItems(nodes, getAxisSortOptions(column));
  if (nodeOrder === "query") {
    return queryOrder;
  }
  return queryOrder
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
  const nodeOrder = colorStepNodes.map((node) => getAxisKey(node.value));
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
