import { useElementSize } from "@mantine/hooks";
import type { RefObject } from "react";

/**
 * Measures the element the returned `ref` is attached to. Width and height
 * are 0 until the first measurement.
 */
export function useContainerSize() {
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  // Mantine types this ref with React 19's `RefObject<T | null>`. Under this
  // repo's React 18 types `RefObject<T>` already allows `null`, so both
  // describe the same object.
  const containerRef = ref as RefObject<HTMLDivElement>;
  return { ref: containerRef, width, height };
}
