import cx from "classnames";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { MetabotLogo } from "metabase/common/components/MetabotLogo";
import animationStyles from "metabase/css/core/animation.module.css";
import { useSetting } from "metabase/settings";
import { Flex, Text, Tooltip } from "metabase/ui";

import S from "./HomeGreeting.module.css";

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

export const MetabotGreeting = () => {
  const [buffer, setBuffer] = useState<string[]>([]);
  const [isCooling, setIsCooling] = useState(false);
  const [isCool, setIsCool] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      setBuffer((prevBuffer) => [...prevBuffer, event.key].slice(-10));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isCoolEnough(buffer)) {
      setTimeout(() => setIsCooling(true), 1);
      setTimeout(() => setIsCool(true), 300);
    }
  }, [buffer]);

  return (
    <Tooltip
      label={t`Don't tell anyone, but you're my favorite.`}
      position="bottom"
    >
      <div className={S.greetingLogoContainer}>
        <MetabotLogo
          className={cx(S.greetingLogo, animationStyles.SpinOut, {
            [S.isCool]: isCool,
            [S.isNotCool]: !isCool,
            [animationStyles.SpinOutActive]: isCooling,
          })}
          variant="cool"
        />
        <MetabotLogo
          className={cx(S.greetingLogo, animationStyles.SpinOut, {
            [S.isCool]: !isCool,
            [S.isNotCool]: isCool,
            [animationStyles.SpinOutActive]: isCooling,
          })}
          variant="happy"
        />
      </div>
    </Tooltip>
  );
};

const isCoolEnough = (buffer: string[]) => {
  const currentBuffer = buffer.join("");
  return (
    currentBuffer ===
    "ArrowUpArrowUpArrowDownArrowDownArrowLeftArrowRightArrowLeftArrowRightba"
  );
};
