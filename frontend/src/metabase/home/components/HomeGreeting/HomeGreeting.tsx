import { t } from "ttag";

import { useSetting } from "metabase/settings";
import { Flex, Text } from "metabase/ui";
import { getSubpathSafeUrl } from "metabase/urls";

import S from "./HomeGreeting.module.css";

// Michael and Associates fork: the firm's icon, scales of justice with a chart.
const ICON_PATH = "app/assets/img/ma-home-icon.png";

export const HomeGreeting = (): JSX.Element | null => {
  const showGreeting = useSetting("show-metabot");

  if (!showGreeting) {
    return null;
  }

  return (
    <Flex align="center">
      <MetabotGreeting />
      <Text
        component="span"
        data-testid="greeting-message"
        c="text-primary"
        fw={700}
        lh="1.5rem"
        fz={{ base: "1.125rem", xl: "1.25rem" }}
        ml="0.5rem"
      >
        {/* Michael & Associates fork: one welcome, in place of Metabase's
            random greetings. */}
        {t`Welcome to the Michael and Associates Data Platform`}
      </Text>
    </Flex>
  );
};

// Michael and Associates fork: keeps Metabase's name, as the setup guide home page uses it too, but draws the firm's
// icon wherever Metabot's faces were.
export const MetabotGreeting = () => (
  <img
    className={S.greetingIcon}
    src={getSubpathSafeUrl(ICON_PATH)}
    alt={t`Michael and Associates Data Platform`}
  />
);
