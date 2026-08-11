import { cn } from "@/lib/ui/cn";
import { Fragment, type ReactNode } from "react";

export type StepDotState = "current" | "past" | "upcoming";
export type StepDotsVariant = "keyword-detail" | "onboarding";

export type StepDotsRenderContext<T> = {
  index: number;
  item: T;
  state: StepDotState;
};

export type StepDotsProps<T> = {
  className?: string;
  currentIndex: number;
  dotClassName?: string;
  dotsClassName?: string;
  items: readonly T[];
  label?: ReactNode;
  renderItem?: (context: StepDotsRenderContext<T>) => ReactNode;
  variant?: StepDotsVariant;
};

export function stepDotStateClass(state: StepDotState, variant: StepDotsVariant = "onboarding") {
  if (state === "current") return "bg-accent-solid text-primary-contrast";
  if (variant === "onboarding" && state === "past")
    return "bg-green-text text-accent-on-solid dark:text-bg";
  return variant === "keyword-detail"
    ? "border-[1.5px] border-border-strong bg-transparent text-fg-muted"
    : "border border-border-strong bg-transparent text-fg-muted";
}

function stateFor(index: number, currentIndex: number): StepDotState {
  if (index < currentIndex) return "past";
  if (index === currentIndex) return "current";
  return "upcoming";
}

export function StepDots<T>({
  className,
  currentIndex,
  dotClassName,
  dotsClassName,
  items,
  label,
  renderItem,
  variant = "onboarding",
}: Readonly<StepDotsProps<T>>) {
  const contexts = items.map((item, index) => ({
    index,
    item,
    state: stateFor(index, currentIndex),
  }));

  return (
    <div className={className}>
      {label}
      {renderItem ? (
        contexts.map((context) => <Fragment key={context.index}>{renderItem(context)}</Fragment>)
      ) : (
        <span aria-hidden className={cn("flex items-center gap-1.5", dotsClassName)}>
          {contexts.map((context) => (
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                stepDotStateClass(context.state, variant),
                dotClassName,
              )}
              data-step-dot-state={context.state}
              key={context.index}
            />
          ))}
        </span>
      )}
    </div>
  );
}
