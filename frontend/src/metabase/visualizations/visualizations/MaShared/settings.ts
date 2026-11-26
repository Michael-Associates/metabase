import type { VisualizationSettings } from "metabase-types/api";

/**
 * Reads a text setting; anything else comes back as `undefined`.
 */
export function readStringSetting(
  settings: VisualizationSettings,
  key: string,
): string | undefined {
  const value: unknown = settings[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Reads an on/off setting; anything else comes back as `undefined`.
 */
export function readBooleanSetting(
  settings: VisualizationSettings,
  key: string,
): boolean | undefined {
  const value: unknown = settings[key];
  return typeof value === "boolean" ? value : undefined;
}

/**
 * Reads a list-of-column-names setting, keeping only the names that are text.
 */
export function readStringListSetting(
  settings: VisualizationSettings,
  key: string,
): string[] {
  const value: unknown = settings[key];
  if (!Array.isArray(value)) {
    return [];
  }
  const items: unknown[] = value;
  return items.filter((item): item is string => typeof item === "string");
}
