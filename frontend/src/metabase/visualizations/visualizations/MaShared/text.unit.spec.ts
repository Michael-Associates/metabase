import { truncateLabel } from "./text";

const CHARACTER_WIDTH = 7;
const measureText = (text: string) => text.length * CHARACTER_WIDTH;

describe("truncateLabel", () => {
  it("returns the label unchanged when it fits", () => {
    expect(truncateLabel("Dallas", 100, measureText)).toBe("Dallas");
  });

  it("keeps as much of the label as fits, followed by an ellipsis", () => {
    const label = truncateLabel("Fort Worth", 5 * CHARACTER_WIDTH, measureText);

    expect(label).toBe("Fort…");
  });

  it("returns an empty label when not even one character fits", () => {
    expect(truncateLabel("Austin", 1, measureText)).toBe("");
  });
});
