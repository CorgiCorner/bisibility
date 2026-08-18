import type { ReactNode } from "react";

type TooltipMockProps = {
  children: ReactNode;
  enterDelay?: number;
  placement?: string;
  title: string;
};

type HouseTooltipMockProps = {
  arrow?: boolean;
  children: ReactNode;
  content: string | number;
  placement?: string;
};

export function Tooltip({ arrow, children, content, placement }: Readonly<HouseTooltipMockProps>) {
  return (
    <span data-tooltip={content} data-tooltip-arrow={arrow} data-tooltip-placement={placement}>
      {children}
    </span>
  );
}

export default function TooltipMock({
  children,
  enterDelay,
  placement,
  title,
}: Readonly<TooltipMockProps>) {
  return (
    <span
      data-tooltip={title}
      data-tooltip-enter-delay={enterDelay}
      data-tooltip-placement={placement}
    >
      {children}
    </span>
  );
}
