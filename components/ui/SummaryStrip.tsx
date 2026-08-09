import { cn } from "@/lib/ui/cn";
import {
  MinusIcon as Minus,
  TrendDownIcon as TrendDown,
  TrendUpIcon as TrendUp,
} from "@phosphor-icons/react/dist/ssr";

export type SummaryStripTone = "dropped" | "improved" | "steady";
export type SummaryStripProps = {
  className?: string;
  loading?: boolean;
  sentence?: string | null;
  tone?: SummaryStripTone;
};

const iconToneClass = {
  dropped: "text-red-text",
  improved: "text-green-text",
  steady: "text-fg-muted",
} satisfies Record<SummaryStripTone, string>;

function SummaryIcon({ tone }: Readonly<{ tone: SummaryStripTone }>) {
  const props = { "aria-hidden": true, size: 14 } as const;
  if (tone === "improved") return <TrendUp {...props} weight="bold" />;
  if (tone === "dropped") return <TrendDown {...props} weight="bold" />;
  return <Minus {...props} weight="bold" />;
}

export function SummaryStrip({
  className,
  loading = false,
  sentence,
  tone = "steady",
}: Readonly<SummaryStripProps>) {
  if (loading) {
    return (
      <div
        aria-hidden
        className={cn("h-[34px] w-full animate-pulse rounded-lg bg-bg-sunken", className)}
      />
    );
  }

  if (!sentence) return null;

  return (
    <div
      aria-label={sentence}
      className={cn(
        "flex w-full items-center gap-[9px] rounded-lg bg-bg-sunken px-3 py-2 text-[13px] font-normal leading-[1.5] text-fg",
        className,
      )}
      role="status"
    >
      <span className={cn("grid shrink-0 place-items-center", iconToneClass[tone])}>
        <SummaryIcon tone={tone} />
      </span>
      <span>{sentence}</span>
    </div>
  );
}
