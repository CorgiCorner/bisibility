import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

export type EmptyStateTone = "accent" | "positive";

export type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  bullets?: string[];
  icon?: ReactNode;
  action?: ReactNode;
  footnote?: ReactNode;
  tone?: EmptyStateTone;
  compact?: boolean;
};

const toneTileClasses = {
  accent: "bg-accent-soft text-accent",
  positive: "text-green [background:color-mix(in_srgb,var(--green)_12%,transparent)]",
} satisfies Record<EmptyStateTone, string>;

export function EmptyState({
  title,
  description,
  bullets,
  icon,
  action,
  footnote,
  tone = "accent",
  compact = false,
}: Readonly<EmptyStateProps>) {
  const hasBullets = bullets != null && bullets.length > 0;
  const copyClasses = cn(
    "leading-[1.55] text-fg-muted",
    compact ? "max-w-[360px] text-[12.5px]" : "max-w-[430px] text-[13.5px]",
  );

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-border bg-bg-elev text-center",
        compact ? "min-h-[126px] px-5 py-6" : "px-8 py-11",
      )}
    >
      {icon ? (
        <span
          className={cn(
            "grid place-items-center",
            compact ? "h-10 w-10 rounded-[10px]" : "h-[54px] w-[54px] rounded-[14px]",
            toneTileClasses[tone],
          )}
        >
          {icon}
        </span>
      ) : null}
      <h3
        className={cn(
          "m-0 font-semibold tracking-[-0.4px]",
          compact ? "text-[15px]" : "text-[18px]",
          icon ? (compact ? "mt-2.5" : "mt-[18px]") : null,
        )}
      >
        {title}
      </h3>
      {description != null ? (
        <div className={cn("m-0 mt-[7px]", copyClasses)}>{description}</div>
      ) : null}
      {hasBullets ? (
        <div className={cn("m-0", description != null ? "mt-1.5" : "mt-[7px]", copyClasses)}>
          <ul className="m-0 mx-auto grid w-fit list-disc gap-1.5 pl-5 text-left marker:text-fg-faint">
            {bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {action ? <div className={compact ? "mt-3" : "mt-[22px]"}>{action}</div> : null}
      {footnote != null ? (
        <div className="mt-3 font-mono text-[11px] text-fg-faint">{footnote}</div>
      ) : null}
    </div>
  );
}
