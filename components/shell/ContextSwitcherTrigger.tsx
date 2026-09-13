import { cn } from "@/lib/ui/cn";
import { CaretUpDownIcon as CaretUpDown } from "@phosphor-icons/react/dist/csr/CaretUpDown";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const contextSwitcherTriggerClassName =
  "inline-flex h-8 min-h-8 min-w-0 flex-none items-center gap-1.5 rounded-control border border-transparent bg-transparent px-2.5 text-[13px] font-medium text-fg outline-none transition-colors hover:border-transparent hover:bg-bg-sunken data-[state=open]:bg-bg-sunken active:bg-bg-inset focus-visible:border-transparent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-solid";

export function ContextSwitcherCaret({ className }: Readonly<{ className?: string }>) {
  return (
    <CaretUpDown
      aria-hidden
      className={cn("shrink-0 text-fg-muted", className)}
      data-context-switcher-caret
      size={13}
      weight="regular"
    />
  );
}

type ContextSwitcherTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  open: boolean;
};

export function ContextSwitcherTrigger({
  children,
  className,
  open,
  ...props
}: Readonly<ContextSwitcherTriggerProps>) {
  return (
    <button
      {...props}
      className={cn(contextSwitcherTriggerClassName, className)}
      data-state={open ? "open" : "closed"}
      type="button"
    >
      {children}
      <ContextSwitcherCaret />
    </button>
  );
}
