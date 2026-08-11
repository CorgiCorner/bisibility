import { cn } from "@/lib/ui/cn";

export const keywordDetailPageStates = [
  "ranked",
  "never_checked",
  "not_ranked",
  "failed",
  "running",
] as const;

export type KeywordDetailPageState = (typeof keywordDetailPageStates)[number];

export type KeywordDetailStatePillProps = {
  className?: string;
  state: KeywordDetailPageState;
};

const stateMeta = {
  failed: { className: "border-red text-red-text", label: "Check failed" },
  never_checked: { className: "border-border-strong text-fg-muted", label: "Not checked" },
  not_ranked: { className: "border-yellow text-yellow-text", label: "Not ranked" },
  ranked: { className: "border-green text-green-text", label: "Ranked" },
  running: { className: "border-blue text-blue-text", label: "Check in progress" },
} satisfies Record<KeywordDetailPageState, { className: string; label: string }>;

export function KeywordDetailStatePill({
  className,
  state,
}: Readonly<KeywordDetailStatePillProps>) {
  const meta = stateMeta[state];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border bg-bg-elev px-2.5 py-1 text-[12px] font-medium",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
