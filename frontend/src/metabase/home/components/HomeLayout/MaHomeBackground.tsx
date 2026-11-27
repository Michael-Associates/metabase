import { Box } from "metabase/ui";
import { getSubpathSafeUrl } from "metabase/urls";

import S from "./MaHomeBackground.module.css";

// Michael and Associates fork: the firm's Lady Justice background, in place of Metabase's lighthouse illustration.
const BACKGROUND_PATH = "app/assets/img/ma-home-background.jpg";

export const MaHomeBackground = () => (
  <Box
    className={S.background}
    data-testid="ma-home-background"
    style={{ backgroundImage: `url(${getSubpathSafeUrl(BACKGROUND_PATH)})` }}
  />
);
