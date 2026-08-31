import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

export const menuActionFooterActionGapPx = 6;
export const menuActionFooterDividerGapPx = 6;
export const menuActionFooterOuterBottomCompensationPx = 14;

export function menuActionFooterVisibleGaps({
  actionPaddingPx,
  footerBottomMarginPx,
  listBottomPaddingPx,
  paperBottomPaddingPx,
}: Readonly<{
  actionPaddingPx: number;
  footerBottomMarginPx: number;
  listBottomPaddingPx: number;
  paperBottomPaddingPx: number;
}>) {
  return {
    dividerToButtonPx: actionPaddingPx,
    buttonToInnerBottomPx:
      actionPaddingPx + listBottomPaddingPx + paperBottomPaddingPx + footerBottomMarginPx,
  };
}

export const menuActionFooterClassName = "-mx-1.5 -mb-3.5 list-none pt-1.5";
export const menuActionFooterDividerClassName = "m-0 w-full border-0 border-t border-border";
export const menuActionFooterContentClassName = "px-1.5 py-1.5";

type MenuActionFooterProps = {
  children: ReactNode;
  className?: string;
};

export function MenuActionFooter({ children, className }: Readonly<MenuActionFooterProps>) {
  return (
    <li className={cn(menuActionFooterClassName, className)} data-slot="menu-action-footer">
      <hr
        className={menuActionFooterDividerClassName}
        data-slot="menu-action-footer-divider"
        role="presentation"
      />
      <div className={menuActionFooterContentClassName} data-slot="menu-action-footer-content">
        {children}
      </div>
    </li>
  );
}
