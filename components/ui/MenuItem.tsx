"use client";
import { cn } from "@/lib/ui/cn";
import type { ComponentProps, ElementType } from "react";
import styles from "./overlay.module.css";
import { MenuItem as Item } from "./primitives/menu";
export type MenuItemProps = Omit<ComponentProps<typeof Item>, "asChild"> & {
  component?: ElementType;
  href?: string;
  target?: string;
  rel?: string;
  selected?: boolean;
};
export function MenuItem({
  component: Component,
  href,
  selected,
  className,
  children,
  onSelect,
  ...props
}: MenuItemProps) {
  const content = Component ? <Component href={href}>{children}</Component> : children;
  return (
    <Item
      data-menu-item
      {...props}
      asChild={Boolean(Component)}
      className={cn(styles.item, className)}
      data-selected={selected || undefined}
      onSelect={(event) => {
        event.preventDefault();
        onSelect?.(event);
      }}
    >
      {content}
    </Item>
  );
}
