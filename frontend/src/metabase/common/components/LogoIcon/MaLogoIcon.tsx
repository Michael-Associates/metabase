import { t } from "ttag";

import S from "./MaLogoIcon.module.css";

interface MaLogoIconProps {
  width?: number;
  height?: number;
}

/**
 * The Michael & Associates "MA" icon: a red M and a black A on a light
 * circle, traced from the firm's icon so it stays sharp at every size.
 */
export const MaLogoIcon = ({ height = 32, width }: MaLogoIconProps) => (
  <svg
    viewBox="67 53 1120 1120"
    width={width}
    height={height}
    role="img"
    aria-label={t`Michael & Associates`}
    data-testid="main-logo"
  >
    <circle className={S.circle} cx={627} cy={613} r={560} />
    <path
      className={S.letterM}
      d="M260 337H394L461 680L529 337H662.5V901H574V498L488 901H432L347.5 500V901H260Z"
    />
    <path
      className={S.letterA}
      fillRule="evenodd"
      d="M808.2 337H926.3L1031.2 901H941.7L917.9 782H812.1L788.3 901H701.2ZM864.5 464L904.2 702H824.8Z"
    />
  </svg>
);
