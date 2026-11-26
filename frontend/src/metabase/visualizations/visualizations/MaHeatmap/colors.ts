import Color from "color";

import { color } from "metabase/ui/colors";

export type HeatmapPalette = {
  positive: string;
  negative: string;
  background: string;
  colorScheme: "light" | "dark";
};

export type HeatmapColorScale = {
  getColor: (value: number) => string;
  isDiverging: boolean;
};

export type HeatmapLegendStop = {
  offset: number;
  color: string;
};

type LabColor = [number, number, number];

const LOW_TINT_RATIO = 0.1;
const MIDDLE_STOP = 0.6;
const HIGH_SHIFT_RATIO = 0.3;
const LEGEND_STOP_COUNT = 11;

/**
 * Maps a value to a fill color.
 *
 * When every value is zero or more, the lowest value gets a faint tint of the
 * positive color and the highest the deepest shade. When any value is
 * negative, the scale diverges around zero: negatives take the negative
 * color, positives the positive color, both deepening with distance from
 * zero on a shared, symmetric range.
 */
export function getHeatmapColorScale(
  [min, max]: [number, number],
  palette: HeatmapPalette,
): HeatmapColorScale {
  const positiveRamp = createRamp(palette.positive, palette);

  if (min < 0) {
    const negativeRamp = createRamp(palette.negative, palette);
    const limit = Math.max(Math.abs(min), Math.abs(max));
    return {
      isDiverging: true,
      getColor: (value) =>
        value < 0
          ? negativeRamp(clampRatio(-value / limit))
          : positiveRamp(clampRatio(value / limit)),
    };
  }

  const span = max - min;
  return {
    isDiverging: false,
    getColor: (value) =>
      positiveRamp(span === 0 ? 1 : clampRatio((value - min) / span)),
  };
}

/**
 * Samples the scale across the value range, low to high, for a legend
 * gradient.
 */
export function getHeatmapLegendStops(
  [min, max]: [number, number],
  scale: HeatmapColorScale,
): HeatmapLegendStop[] {
  const low = scale.isDiverging ? -Math.max(Math.abs(min), Math.abs(max)) : min;
  const high = scale.isDiverging ? -low : max;

  return Array.from({ length: LEGEND_STOP_COUNT }, (_, index) => {
    const offset = index / (LEGEND_STOP_COUNT - 1);
    return {
      offset,
      color: scale.getColor(low + (high - low) * offset),
    };
  });
}

/**
 * Picks a label color that stays readable on the given cell fill, in both
 * light and dark themes.
 */
export function getCellLabelColor(fill: string): string {
  return Color(fill).isLight()
    ? color("text-primary")
    : color("text-primary-inverse");
}

function createRamp(
  baseColor: string,
  palette: HeatmapPalette,
): (ratio: number) => string {
  const base = toLab(baseColor);
  const low = mixLab(toLab(palette.background), base, LOW_TINT_RATIO);
  const shiftedBase = Color(baseColor);
  const high = toLab(
    palette.colorScheme === "dark"
      ? shiftedBase.lighten(HIGH_SHIFT_RATIO).hex()
      : shiftedBase.darken(HIGH_SHIFT_RATIO).hex(),
  );

  return (ratio) => {
    const lab =
      ratio <= MIDDLE_STOP
        ? mixLab(low, base, ratio / MIDDLE_STOP)
        : mixLab(base, high, (ratio - MIDDLE_STOP) / (1 - MIDDLE_STOP));
    return Color.lab(...lab).hex();
  };
}

function toLab(value: string): LabColor {
  const [lightness, greenRed, blueYellow] = Color(value).lab().array();
  return [lightness, greenRed, blueYellow];
}

function mixLab(from: LabColor, to: LabColor, ratio: number): LabColor {
  return [
    from[0] + (to[0] - from[0]) * ratio,
    from[1] + (to[1] - from[1]) * ratio,
    from[2] + (to[2] - from[2]) * ratio,
  ];
}

function clampRatio(ratio: number) {
  return Math.min(1, Math.max(0, ratio));
}
