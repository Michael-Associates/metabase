import type { CSSProperties } from "react";

import { Box } from "metabase/ui";
import { getSubpathSafeUrl } from "metabase/urls";

import S from "./MaHomeBackground.module.css";

// Michael and Associates fork: the firm's Lady Justice background, in place of Metabase's lighthouse illustration.
// The picture's three parts, which the stylesheet places so the whole picture shows at every page size. The paths
// start at the site root: the stylesheet uses them through CSS variables, and a relative URL there resolves against
// the stylesheet's own location (`/app/dist/`), not the page's `<base href>`.
const PICTURE_PARTS = {
  "--ma-home-background-left": "/app/assets/img/ma-home-background-left.jpg",
  "--ma-home-background-right": "/app/assets/img/ma-home-background-right.jpg",
  "--ma-home-background-middle":
    "/app/assets/img/ma-home-background-middle.png",
};

const getPictureStyle = () => {
  const variables = Object.fromEntries(
    Object.entries(PICTURE_PARTS).map(([variable, path]) => [
      variable,
      `url(${getSubpathSafeUrl(path)})`,
    ]),
  );
  // React's CSSProperties type has no entries for CSS variables (`--name`), so the style needs a cast.
  return variables as CSSProperties;
};

export const MaHomeBackground = () => (
  <Box className={S.background}>
    <Box
      className={S.picture}
      data-testid="ma-home-background"
      style={getPictureStyle()}
    />
  </Box>
);
