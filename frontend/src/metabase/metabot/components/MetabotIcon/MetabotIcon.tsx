import { forwardRef } from "react";

import { useSetting } from "metabase/settings";
import { Box, type BoxProps } from "metabase/ui";
import { getSubpathSafeUrl } from "metabase/urls";

// Michael and Associates fork: Claude Brain's icon (the brain from the firm's ClaudeBrain image) in place of
// Metabot's built-in icon.
const CLAUDE_BRAIN_ICON_PATH = "app/assets/img/ma-claude-brain-icon.png";

export interface MetabotIconProps extends BoxProps {
  size?: number;
}

/**
 * Renders the metabot icon — Claude Brain's icon in this fork,
 * or a custom uploaded image from the "metabot-icon" setting.
 */
export const MetabotIcon = forwardRef<HTMLImageElement, MetabotIconProps>(
  function MetabotIcon({ size = 16, ...rest }, ref) {
    const metabotIcon = useSetting("metabot-icon");
    const metabotName = useSetting("metabot-name");

    const isCustomIcon = metabotIcon && metabotIcon !== "metabot";

    return (
      <Box
        component="img"
        ref={ref}
        src={
          isCustomIcon ? metabotIcon : getSubpathSafeUrl(CLAUDE_BRAIN_ICON_PATH)
        }
        alt={metabotName}
        w={size}
        h={size}
        style={{ objectFit: "contain" }}
        {...rest}
      />
    );
  },
);
