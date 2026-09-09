import type { ReactNode } from "react";

type HouseTooltipMockProps = {
  arrow?: boolean;
  children: ReactNode;
  content: string | number;
  placement?: string;
  wrapperClassName?: string;
};

export function Tooltip({
  arrow,
  children,
  content,
  placement,
  wrapperClassName,
}: Readonly<HouseTooltipMockProps>) {
  return (
    <span
      className={wrapperClassName}
      data-tooltip={content}
      data-tooltip-arrow={arrow}
      data-tooltip-placement={placement}
    >
      {children}
    </span>
  );
}
