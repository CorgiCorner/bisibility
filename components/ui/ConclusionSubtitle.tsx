import { cn } from "@/lib/ui/cn";

export type ConclusionSubtitleProps = {
  className?: string;
  loading?: boolean;
  text?: string | null;
};

export function ConclusionSubtitle({
  className,
  loading = false,
  text,
}: Readonly<ConclusionSubtitleProps>) {
  if (loading) {
    return (
      <div
        aria-hidden
        className={cn(
          "mb-3 mt-2 h-[13px] w-3/5 animate-pulse rounded-full bg-bg-sunken",
          className,
        )}
      />
    );
  }

  if (!text) return null;

  return (
    <p
      className={cn(
        "m-0 mt-2 line-clamp-2 min-h-[39px] whitespace-normal text-[13px] font-normal leading-[1.5] text-fg-muted",
        className,
      )}
    >
      {text}
    </p>
  );
}
