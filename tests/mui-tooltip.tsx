import type { ReactNode } from "react";

type TooltipMockProps = {
  children: ReactNode;
  enterDelay?: number;
  placement?: string;
  title: string;
};

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
