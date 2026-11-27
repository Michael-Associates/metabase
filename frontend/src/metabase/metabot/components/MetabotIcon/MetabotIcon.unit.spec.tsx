import { createMockSettingsState, createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";

import { MetabotIcon } from "./MetabotIcon";

const setup = (metabotIcon: string) =>
  renderWithProviders(<MetabotIcon />, {
    storeInitialState: createMockState({
      settings: createMockSettingsState({
        "metabot-icon": metabotIcon,
        "metabot-name": "Claude Brain",
      }),
    }),
  });

describe("MetabotIcon", () => {
  it("should show Claude Brain's icon by default", () => {
    setup("metabot");

    expect(screen.getByRole("img", { name: "Claude Brain" })).toHaveAttribute(
      "src",
      expect.stringContaining("app/assets/img/ma-claude-brain-icon.png"),
    );
  });

  it("should show a custom uploaded icon", () => {
    setup("data:image/png;base64,AAAA");

    expect(screen.getByRole("img", { name: "Claude Brain" })).toHaveAttribute(
      "src",
      "data:image/png;base64,AAAA",
    );
  });
});
