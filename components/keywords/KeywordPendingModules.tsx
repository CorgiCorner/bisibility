import { KeywordContextRow } from "@/components/keywords/KeywordContextRow";
import { Card, SectionTitle } from "@/components/ui";
import {
  deriveKeywordDetailChangeDimensions,
  describeKeywordDetailPositionChange,
  type KeywordDetailKeywordContext,
  type KeywordDetailRankState,
  type KeywordDetailWhatChanged,
} from "@/lib/keyword-detail/state-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import {
  ArrowDownIcon as ArrowDown,
  ArrowUpIcon as ArrowUp,
  ArrowUpRightIcon as ArrowUpRight,
  ClockCountdownIcon as ClockCountdown,
  MinusIcon as Minus,
  RankingIcon as Ranking,
  SpinnerGapIcon as SpinnerGap,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";
import type { EmptyRankCopy } from "./KeywordPendingEmptyState";

type KeywordPendingModulesProps = {
  copy: EmptyRankCopy;
  keyword: KeywordRow;
  keywordContext?: KeywordDetailKeywordContext;
  state: Exclude<KeywordDetailRankState, "normal">;
  whatChanged?: KeywordDetailWhatChanged;
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(
    new Date(value),
  );
}

function pathLabel(value: string | null) {
  if (!value) return "Not set";
  if (value.startsWith("/")) return value;
  try {
    return new URL(value).pathname || "/";
  } catch {
    return value;
  }
}

function SummaryCard({ children, label }: Readonly<{ children: ReactNode; label: string }>) {
  return (
    <Card className="min-h-[148px] rounded-[14px]" size="sm" sx={{ padding: "15px 16px" }}>
      <p className="m-0 font-mono text-[10px] uppercase tracking-[0.65px] text-fg-muted">{label}</p>
      <div className="mt-2.5">{children}</div>
    </Card>
  );
}

function PositionTile({
  copy,
  keyword,
}: Readonly<{
  copy: EmptyRankCopy;
  keyword: KeywordRow;
}>) {
  return (
    <SummaryCard label="Position">
      <p className="m-0 text-[15px] font-semibold leading-none text-fg-muted">{copy.badge}</p>
      <p className="m-0 mt-3 font-mono text-[10.5px] text-fg-muted">
        Tracked since {dateLabel(keyword.createdAt)}
      </p>
    </SummaryCard>
  );
}

function RankingUrlTile({ keyword }: Readonly<{ keyword: KeywordRow }>) {
  return (
    <SummaryCard label="Ranking URL">
      <p className="m-0 text-[15px] font-semibold text-fg-muted">No ranking URL yet</p>
      <p className="m-0 mt-2.5 font-mono text-[11px] text-fg-muted">
        Target {pathLabel(keyword.targetUrl)}
      </p>
      <p className="m-0 mt-4 font-mono text-[10.5px] text-fg-muted">No URL ranking yet</p>
    </SummaryCard>
  );
}

function ChangedTile({
  keyword,
  whatChanged,
}: Readonly<{ keyword: KeywordRow; whatChanged: KeywordDetailWhatChanged }>) {
  const dimensions = deriveKeywordDetailChangeDimensions(keyword);
  const positionChange = describeKeywordDetailPositionChange(dimensions);

  return (
    <SummaryCard label="What changed">
      {whatChanged === "no_change" ? (
        <span className="flex items-center gap-2 text-[12px] text-fg">
          <Minus className="text-fg-muted" size={13} weight="bold" />
          No changes since the previous check
        </span>
      ) : null}
      {whatChanged === "diff" ? (
        <div className="grid gap-2 text-[12px] text-fg">
          {positionChange ? (
            <span className="flex items-center gap-2">
              {positionChange.direction === "improved" || positionChange.direction === "entered" ? (
                <ArrowUp className="text-green-text" size={13} weight="bold" />
              ) : (
                <ArrowDown className="text-red-text" size={13} weight="bold" />
              )}
              {positionChange.text}
            </span>
          ) : null}
          {dimensions.rankingUrlChanged ? (
            <span className="flex items-center gap-2">
              <ArrowUpRight className="text-yellow-text" size={13} weight="bold" />
              Ranking URL changed
            </span>
          ) : null}
          {!positionChange && !dimensions.rankingUrlChanged ? (
            <span className="text-fg-muted">No detailed change data available.</span>
          ) : null}
        </div>
      ) : null}
    </SummaryCard>
  );
}

function PendingChart({
  copy,
  state,
}: Readonly<{ copy: EmptyRankCopy; state: KeywordPendingModulesProps["state"] }>) {
  const running = state === "running";
  const Icon =
    state === "never_checked"
      ? ClockCountdown
      : state === "not_ranked"
        ? Ranking
        : state === "failed"
          ? WarningCircle
          : SpinnerGap;
  const iconColor =
    state === "failed"
      ? "text-red-text"
      : state === "not_ranked"
        ? "text-yellow-text"
        : state === "running"
          ? "text-blue-text"
          : "text-fg-muted";

  return (
    <Card className="rounded-[14px]" size="lg">
      <SectionTitle>Position history</SectionTitle>
      <div className="mt-3 grid min-h-[176px] place-items-center rounded-[12px] bg-bg-sunken px-5 text-center">
        <div>
          <span
            className={`mx-auto grid h-10 w-10 place-items-center rounded-[10px] bg-bg-sunken ${iconColor}`}
          >
            <Icon aria-hidden className={running ? "bv-spin" : undefined} size={20} weight="bold" />
          </span>
          <p className="m-0 mt-3 text-[15px] font-semibold leading-[1.35] text-fg">{copy.title}</p>
          <p className="m-0 mt-1.5 text-[12px] leading-[1.45] text-fg-muted">{copy.body}</p>
        </div>
      </div>
    </Card>
  );
}

export function KeywordPendingModules({
  copy,
  keyword,
  keywordContext,
  state,
  whatChanged = "first_check",
}: Readonly<KeywordPendingModulesProps>) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <PositionTile copy={copy} keyword={keyword} />
        <RankingUrlTile keyword={keyword} />
        <ChangedTile keyword={keyword} whatChanged={whatChanged} />
      </div>
      <KeywordContextRow keyword={keyword} state={keywordContext} />
      <PendingChart copy={copy} state={state} />
    </div>
  );
}
