import { useEffect, useState } from "react";
import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { Box, Button, Stack, Text } from "metabase/ui";

import S from "./MaGraph.module.css";

interface ChartSettingGraphCodeProps {
  id?: string;
  value: string | undefined;
  onChange: (value: string) => void;
}

/**
 * The graph code editor in the card's settings. Edits apply on "Apply", so
 * the graph doesn't reload on every keystroke. Only admins can change the
 * code: everyone else reads it, and the server refuses their saves anyway.
 */
export function ChartSettingGraphCode({
  id,
  value,
  onChange,
}: ChartSettingGraphCodeProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  return (
    <Stack gap="sm" data-testid="ma-graph-code">
      <Box className={S.editor}>
        <CodeEditor
          id={id}
          language="html"
          value={draft}
          readOnly={!isAdmin}
          onChange={setDraft}
        />
      </Box>
      {isAdmin ? (
        <Button
          variant="filled"
          disabled={draft === (value ?? "")}
          onClick={() => onChange(draft)}
        >
          {t`Apply`}
        </Button>
      ) : (
        <Text c="text-secondary" fz="sm">
          {t`Only admins can change a custom graph's code.`}
        </Text>
      )}
    </Stack>
  );
}
