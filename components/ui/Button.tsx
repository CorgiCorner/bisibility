"use client";

import { cn } from "@/lib/ui/cn";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import type { ComponentProps, ElementType, ReactNode } from "react";
import styles from "./Button.module.css";
import { Spinner } from "./Spinner";

export const buttonXsStyle = { fontSize: "12px", minHeight: 30, padding: "4px 10px" } as const;

export type ButtonVariant = "destructive" | "ghost" | "primary" | "secondary";
export type ButtonSize = "lg" | "md" | "sm" | "xs";
export type ButtonProps = Omit<ComponentProps<"button">, "color"> & {
  asChild?: boolean;
  component?: ElementType;
  download?: string;
  endIcon?: ReactNode;
  fullWidth?: boolean;
  href?: string;
  loading?: boolean;
  loadingIndicator?: ReactNode;
  loadingLabel?: string;
  rel?: string;
  size?: ButtonSize;
  startIcon?: ReactNode;
  target?: string;
  variant?: ButtonVariant;
};
const buttonVariants = cva(styles.root, {
  variants: {
    variant: {
      primary: styles.primary,
      secondary: styles.secondary,
      ghost: styles.ghost,
      destructive: styles.destructive,
    },
    size: { xs: styles.xs, sm: styles.sm, md: styles.md, lg: styles.lg },
  },
});
export function Button({
  asChild,
  children,
  className,
  component,
  disabled,
  endIcon,
  fullWidth,
  href,
  loading = false,
  loadingIndicator,
  loadingLabel,
  size = "md",
  startIcon,
  variant = "primary",
  type,
  ...props
}: ButtonProps) {
  const busy = loading || disabled;
  const Component = asChild ? Slot : (component ?? (href ? "a" : "button"));
  const icon = loading ? (loadingIndicator ?? <Spinner />) : startIcon;
  return (
    <Component
      {...props}
      aria-busy={loading || props["aria-busy"] || undefined}
      aria-disabled={href && busy ? true : props["aria-disabled"]}
      className={cn(buttonVariants({ variant, size }), fullWidth && "w-full", className)}
      onClick={
        busy
          ? (event: React.MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
            }
          : props.onClick
      }
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      disabled={href ? undefined : busy}
      href={busy && !component ? undefined : href}
      tabIndex={href && busy ? -1 : props.tabIndex}
      type={href || component ? type : (type ?? "button")}
    >
      {asChild ? (
        children
      ) : (
        <>
          {icon ? (
            <span data-button-start-icon className="inline-flex shrink-0">
              {icon}
            </span>
          ) : null}
          {loading && loadingLabel ? (
            loadingLabel
          ) : typeof children === "string" ? (
            <span data-replay-label>{children}</span>
          ) : (
            children
          )}
          {endIcon ? (
            <span data-button-end-icon className="inline-flex shrink-0">
              {endIcon}
            </span>
          ) : null}
        </>
      )}
    </Component>
  );
}
