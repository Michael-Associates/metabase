import userEvent from "@testing-library/user-event";

import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";

import { ChartSettingGraphCode } from "./ChartSettingGraphCode";

type MockCodeEditorProps = {
  value: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
};

jest.mock("metabase/common/components/CodeEditor", () => ({
  CodeEditor: ({ value, readOnly, onChange }: MockCodeEditorProps) => (
    <textarea
      aria-label="Graph code"
      value={value}
      readOnly={readOnly}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

interface SetupOpts {
  isAdmin: boolean;
}

const setup = ({ isAdmin }: SetupOpts) => {
  const onChange = jest.fn<void, [string]>();
  renderWithProviders(
    <ChartSettingGraphCode value="<p>old</p>" onChange={onChange} />,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
      }),
    },
  );
  return { onChange };
};

describe("ChartSettingGraphCode", () => {
  it("lets an admin edit the code and apply it", async () => {
    const { onChange } = setup({ isAdmin: true });

    const editor = screen.getByRole("textbox", { name: "Graph code" });
    await userEvent.clear(editor);
    await userEvent.type(editor, "<p>new</p>");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledWith("<p>new</p>");
  });

  it("applies nothing until the code changes", () => {
    setup({ isAdmin: true });

    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("shows the code read-only to everyone else", () => {
    setup({ isAdmin: false });

    expect(screen.getByRole("textbox", { name: "Graph code" })).toHaveAttribute(
      "readonly",
    );
    expect(
      screen.queryByRole("button", { name: "Apply" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Only admins can change a custom graph's code."),
    ).toBeInTheDocument();
  });
});
