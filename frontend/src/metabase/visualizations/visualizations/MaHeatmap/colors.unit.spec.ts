import Color from "color";

import { color } from "metabase/ui/colors";

import {
  type HeatmapPalette,
  getCellLabelColor,
  getHeatmapColorScale,
  getHeatmapLegendStops,
} from "./colors";

const LIGHT_PALETTE: HeatmapPalette = {
  positive: color("brand"),
  negative: color("error"),
  background: color("background-primary"),
  colorScheme: "light",
};

const getLightness = (value: string) => Color(value).lab().array()[0];

const getLabDistance = (first: string, second: string) => {
  const [l1, a1, b1] = Color(first).lab().array();
  const [l2, a2, b2] = Color(second).lab().array();
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

describe("getHeatmapColorScale", () => {
  it("gets darker as values grow when every value is zero or more", () => {
    const scale = getHeatmapColorScale([0, 100], LIGHT_PALETTE);
    const lightnesses = [0, 25, 50, 75, 100].map((value) =>
      getLightness(scale.getColor(value)),
    );

    expect(scale.isDiverging).toBe(false);
    lightnesses.slice(1).forEach((lightness, index) => {
      expect(lightness).toBeLessThan(lightnesses[index]);
    });
  });

  it("starts from a faint tint that is lighter than the chosen color", () => {
    const scale = getHeatmapColorScale([10, 20], LIGHT_PALETTE);

    expect(getLightness(scale.getColor(10))).toBeGreaterThan(
      getLightness(LIGHT_PALETTE.positive),
    );
    expect(getLightness(scale.getColor(20))).toBeLessThan(
      getLightness(LIGHT_PALETTE.positive),
    );
  });

  it("gets lighter as values grow in the dark theme", () => {
    const scale = getHeatmapColorScale([0, 100], {
      ...LIGHT_PALETTE,
      background: color("background-primary-inverse"),
      colorScheme: "dark",
    });

    expect(getLightness(scale.getColor(100))).toBeGreaterThan(
      getLightness(scale.getColor(0)),
    );
  });

  it("gives cells the deepest shade when all values are equal", () => {
    const scale = getHeatmapColorScale([7, 7], LIGHT_PALETTE);

    expect(getLightness(scale.getColor(7))).toBeLessThan(
      getLightness(LIGHT_PALETTE.positive),
    );
  });

  it("colors negative values with the negative color and positive values with the positive color", () => {
    const scale = getHeatmapColorScale([-50, 100], LIGHT_PALETTE);
    const negativeFill = scale.getColor(-50);
    const positiveFill = scale.getColor(100);

    expect(scale.isDiverging).toBe(true);
    expect(getLabDistance(negativeFill, LIGHT_PALETTE.negative)).toBeLessThan(
      getLabDistance(negativeFill, LIGHT_PALETTE.positive),
    );
    expect(getLabDistance(positiveFill, LIGHT_PALETTE.positive)).toBeLessThan(
      getLabDistance(positiveFill, LIGHT_PALETTE.negative),
    );
    expect(getLightness(scale.getColor(0))).toBeGreaterThan(
      getLightness(negativeFill),
    );
  });

  it("measures both sides of a diverging scale against the same limit", () => {
    const lopsided = getHeatmapColorScale([-20, 100], LIGHT_PALETTE);
    const balanced = getHeatmapColorScale([-100, 100], LIGHT_PALETTE);

    expect(lopsided.getColor(-20)).toBe(balanced.getColor(-20));
    expect(lopsided.getColor(60)).toBe(balanced.getColor(60));
  });
});

describe("getHeatmapLegendStops", () => {
  it("samples the scale from the lowest to the highest value", () => {
    const scale = getHeatmapColorScale([0, 100], LIGHT_PALETTE);
    const stops = getHeatmapLegendStops([0, 100], scale);

    expect(stops[0]).toEqual({ offset: 0, color: scale.getColor(0) });
    expect(stops[stops.length - 1]).toEqual({
      offset: 1,
      color: scale.getColor(100),
    });
  });

  it("puts zero in the middle of a diverging legend", () => {
    const scale = getHeatmapColorScale([-20, 100], LIGHT_PALETTE);
    const stops = getHeatmapLegendStops([-20, 100], scale);

    expect(stops[Math.floor(stops.length / 2)]).toEqual({
      offset: 0.5,
      color: scale.getColor(0),
    });
    expect(stops[0].color).toBe(scale.getColor(-100));
  });
});

describe("getCellLabelColor", () => {
  it("uses dark text on light fills and light text on dark fills", () => {
    expect(getCellLabelColor(color("background-primary"))).toBe(
      color("text-primary"),
    );
    expect(getCellLabelColor(color("text-primary"))).toBe(
      color("text-primary-inverse"),
    );
  });
});
