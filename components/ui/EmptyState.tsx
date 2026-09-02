import { cn } from "@/lib/ui/cn";
import { CheckIcon as Check } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";
import { iconWellClassName } from "./icon-well-styles";

export type EmptyStateTone = "accent" | "positive";

export type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  bullets?: string[];
  icon?: ReactNode;
  mark?: ReactNode;
  action?: ReactNode;
  footnote?: ReactNode;
  tone?: EmptyStateTone;
  compact?: boolean;
};

const toneTileClasses = {
  accent: iconWellClassName,
  positive: "text-green-text [background:color-mix(in_srgb,var(--green)_12%,transparent)]",
} satisfies Record<EmptyStateTone, string>;

export function EmptyState({
  title,
  description,
  bullets,
  icon,
  mark,
  action,
  footnote,
  tone = "accent",
  compact = false,
}: Readonly<EmptyStateProps>) {
  const hasMedia = mark != null || icon != null;
  const hasBullets = bullets != null && bullets.length > 0;
  const copyClasses = cn(
    "leading-[1.55] text-fg-muted",
    compact ? "max-w-[360px] text-[12.5px]" : "max-w-[430px] text-[13.5px]",
  );

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        // Compact always sits inside something that already has an edge - a card, a column -
        // so it carries no border and no fill of its own; two boxes for one message read as
        // a nested panel that means nothing.
        compact
          ? "min-h-[126px] px-5 py-6"
          : "rounded-card border border-border bg-bg-elev px-8 py-11",
      )}
    >
      {mark ??
        (icon ? (
          <span
            className={cn(
              "grid place-items-center",
              compact ? "h-10 w-10 rounded-control" : "h-12 w-12 rounded-card",
              toneTileClasses[tone],
            )}
          >
            {icon}
          </span>
        ) : null)}
      <h3
        className={cn(
          "m-0 font-semibold tracking-[-0.4px]",
          compact ? "text-[15px]" : "text-[18px]",
          hasMedia ? (compact ? "mt-2.5" : "mt-4.5") : null,
        )}
      >
        {title}
      </h3>
      {description != null ? (
        <div className={cn("m-0 mt-[7px]", copyClasses)}>{description}</div>
      ) : null}
      {hasBullets ? (
        <div className={cn("m-0", description != null ? "mt-1.5" : "mt-2.5", copyClasses)}>
          <ul className="m-0 mx-auto grid w-fit list-none gap-1.5 p-0 text-left">
            {bullets.map((bullet) => (
              <li className="flex items-start gap-2.5" key={bullet}>
                <Check
                  aria-hidden
                  className="shrink-0 self-center [color:color-mix(in_srgb,var(--fg-muted)_60%,transparent)]"
                  data-empty-state-bullet="true"
                  data-empty-state-bullet-kind="check"
                  size={14}
                  weight="regular"
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {action ? <div className={compact ? "mt-3" : "mt-5.5"}>{action}</div> : null}
      {footnote != null ? <div className="mt-3 text-[11px] text-fg-muted">{footnote}</div> : null}
    </div>
  );
}
