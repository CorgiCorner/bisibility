import { cn } from "@/lib/ui/cn";
import { MinusIcon as Minus } from "@phosphor-icons/react/dist/ssr/Minus";
import { TrendDownIcon as TrendDown } from "@phosphor-icons/react/dist/ssr/TrendDown";
import { TrendUpIcon as TrendUp } from "@phosphor-icons/react/dist/ssr/TrendUp";

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
  if (tone === "improved") return <TrendUp {...props} weight="regular" />;
  if (tone === "dropped") return <TrendDown {...props} weight="regular" />;
  return <Minus {...props} weight="regular" />;
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
        className={cn(
          "h-8.5 w-full animate-pulse motion-reduce:animate-none rounded-control bg-bg-sunken",
          className,
        )}
      />
    );
  }

  if (!sentence) return null;

  return (
    <div
      aria-label={sentence}
      className={cn(
        "flex w-full items-center gap-[9px] rounded-control bg-bg-sunken px-3 py-2 text-[13px] font-normal leading-[1.5] text-fg",
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
