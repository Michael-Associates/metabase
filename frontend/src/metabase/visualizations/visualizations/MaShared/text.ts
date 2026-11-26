export type MeasureText = (text: string) => number;

const ELLIPSIS = "…";

/**
 * Shortens a label with an ellipsis so it fits within `maxWidth`. Returns an
 * empty label when not even one character fits.
 */
export function truncateLabel(
  label: string,
  maxWidth: number,
  measureText: MeasureText,
): string {
  if (measureText(label) <= maxWidth) {
    return label;
  }

  let low = 0;
  let high = label.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = label.slice(0, middle) + ELLIPSIS;
    if (measureText(candidate) <= maxWidth) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return low > 0 ? label.slice(0, low) + ELLIPSIS : "";
}
