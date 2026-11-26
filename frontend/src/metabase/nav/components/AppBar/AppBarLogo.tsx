import cx from "classnames";
import type { MouseEvent } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { LogoIcon } from "metabase/common/components/LogoIcon";
import { useIsAtHomepageDashboard } from "metabase/common/hooks/use-is-at-homepage-dashboard";
import { Text } from "metabase/ui";

import S from "./AppBar.module.css";

export interface AppBarLogoProps {
  isSmallAppBar?: boolean;
  isLogoVisible?: boolean;
  isNavBarEnabled?: boolean;
  isGitSyncVisible?: boolean;
  onLogoClick?: () => void;
}

export function AppBarLogo({
  isLogoVisible,
  isSmallAppBar,
  isNavBarEnabled,
  isGitSyncVisible,
  onLogoClick,
}: AppBarLogoProps): JSX.Element | null {
  const isAtHomepageDashboard = useIsAtHomepageDashboard();

  if (!isLogoVisible) {
    return null;
  }

  const handleClick = (event: MouseEvent) => {
    // Prevent navigating to the dashboard homepage when a user is already there
    // https://github.com/metabase/metabase/issues/43800
    if (isAtHomepageDashboard) {
      event.preventDefault();
    }
    onLogoClick?.();
  };

  return (
    <Link
      to="/"
      className={cx(S.logoLink, {
        [S.logoLinkSpaced]: !isSmallAppBar && !isGitSyncVisible,
        [S.logoLinkSpacedGitSync]: !isSmallAppBar && isGitSyncVisible,
      })}
      onClick={handleClick}
      disabled={!isNavBarEnabled}
      data-testid="main-logo-link"
    >
      <LogoIcon height={32} />
      {!isSmallAppBar && (
        <Text
          component="span"
          ml="sm"
          fw={700}
          lh="1.25rem"
          c="text-primary"
          style={{ whiteSpace: "nowrap" }}
          data-testid="ma-app-title"
        >
          {t`M&A Data Platform`}
        </Text>
      )}
    </Link>
  );
}
