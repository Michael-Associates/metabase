// eslint-disable-next-line eslint-js/no-restricted-imports
import { Global, css } from "@emotion/react";
import { useMemo } from "react";

import { baseStyle, rootStyle } from "metabase/css/core/base.styled";
import { defaultFontFiles } from "metabase/css/core/fonts.styled";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import {
  isPublicEmbedding,
  isStaticEmbedding,
} from "metabase/embedding/config";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import { getMetabaseCssVariables } from "metabase/styled-components/theme/css-variables";
import { useMantineTheme } from "metabase/ui";
import { getSitePath } from "metabase/utils/dom";
import { getFontFamilyValue } from "metabase/utils/fonts";
import { getSaveDomImageStyles } from "metabase/viz-core";

import { getFont, getFontFiles } from "../../selectors";

export const GlobalStyles = (): JSX.Element => {
  const font = useSelector(getFont);
  const fontFiles = useSelector(getFontFiles);
  const whitelabelColors = useSetting("application-colors");

  const sitePath = getSitePath();
  const theme = useMantineTheme();
  const { colorScheme } = theme.other;

  // This can get expensive so we should memoize it separately
  const cssVariables = useMemo(() => {
    return getMetabaseCssVariables({ theme, whitelabelColors });
  }, [theme, whitelabelColors]);

  const styles = useMemo(() => {
    // eslint-disable-next-line metabase/no-color-literals -- Michael and Associates fork: --ma-color-chrome is the grey of the firm's home background image, which has no palette entry.
    return css`
      ${cssVariables}
      :root {
        --mb-default-font-family: ${getFontFamilyValue(font)};
        /* Michael and Associates fork: the grey of the firm's home background, for the left menu and the top bar.
           Dark mode keeps the page color. */
        --ma-color-chrome: #e4e2e7;
      }
      [data-mantine-color-scheme="dark"] {
        --ma-color-chrome: var(--mb-color-background_page-primary);
      }

      ${defaultFontFiles({ baseUrl: sitePath })}
      ${fontFiles?.map(
        (file) => css`
          @font-face {
            font-family: "Custom";
            src: url(${encodeURI(file.src)}) format("${file.fontFormat}");
            font-weight: ${file.fontWeight};
            font-style: normal;
            font-display: swap;
          }
        `,
      )}
    ${getSaveDomImageStyles(isEmbeddingSdk())}
    body {
        font-size: 0.875em;
        ${isStaticEmbedding() || isPublicEmbedding()
          ? ""
          : `color-scheme: ${colorScheme};`}
        ${rootStyle}
      }

      ${baseStyle}
    `;
  }, [cssVariables, font, sitePath, fontFiles, colorScheme]);

  return <Global styles={styles} />;
};
