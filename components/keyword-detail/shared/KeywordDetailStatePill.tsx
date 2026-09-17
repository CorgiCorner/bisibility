import { cn } from "@/lib/ui/cn";
import { useTranslations } from "next-intl";

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
  failed: { className: "border-red text-red-text", message: "failed" },
  never_checked: { className: "border-border-control text-fg-muted", message: "neverChecked" },
  not_ranked: { className: "border-yellow text-yellow-text", message: "notRanked" },
  ranked: { className: "border-green text-green-text", message: "ranked" },
  running: { className: "border-blue text-blue-text", message: "running" },
} as const satisfies Record<
  KeywordDetailPageState,
  {
    className: string;
    message: "failed" | "neverChecked" | "notRanked" | "ranked" | "running";
  }
>;

export function KeywordDetailStatePill({
  className,
  state,
}: Readonly<KeywordDetailStatePillProps>) {
  const t = useTranslations("projectRankTracker.keywordDetail.empty.state");
  const meta = stateMeta[state];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border bg-bg-elev px-2.5 py-1 text-[12px] font-medium",
        meta.className,
        className,
      )}
    >
      {t(meta.message)}
    </span>
  );
}
