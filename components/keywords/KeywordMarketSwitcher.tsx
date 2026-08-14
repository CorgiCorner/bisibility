"use client";

import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { useToast } from "@/components/ui";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import type { AddKeywordsInput, BulkKeywordIdsInput } from "@/lib/schemas/keyword";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import {
  CaretDownIcon as CaretDown,
  CheckIcon as Check,
  DeviceMobileIcon as DeviceMobile,
  FlagIcon as Flag,
  MonitorIcon as Monitor,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { actionErrorMessage, type KeywordAction } from "./action-utils";

type Market = ProjectMarketsView["markets"][number];

type KeywordMarketSwitcherProps = {
  addKeywordsAction: KeywordAction<AddKeywordsInput>;
  bulkDeleteAction: KeywordAction<BulkKeywordIdsInput>;
  canCreateKeyword: boolean;
  keyword: KeywordRow;
  projectId: string;
  projectMarkets?: ProjectMarketsView;
  targets: readonly KeywordRow[];
};

function pairLabel(target: Pick<KeywordRow, "location">) {
  return `${target.location.displayName} / ${target.location.languageLabel ?? target.location.hl}`;
}

function marketLabel(market: Market) {
  return `${market.displayName} / ${market.languageLabel}`;
}

function createdKeywordIds(result: unknown) {
  if (!result || typeof result !== "object" || !("keywords" in result)) return [];
  const keywords = (result as { keywords?: unknown }).keywords;
  if (!Array.isArray(keywords)) return [];
  return keywords.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const publicId = (item as { publicId?: unknown }).publicId;
    const id = typeof publicId === "string" ? publicId : (item as { id?: unknown }).id;
    return typeof id === "string" ? [id] : [];
  });
}

function scheduleInput(keyword: KeywordRow) {
  return {
    cronExpression: keyword.schedule.cron_expression,
    frequency: keyword.schedule.frequency,
    jitterMinutes: keyword.schedule.jitter_minutes,
    serpDepth: keyword.schedule.serp_depth,
    timezone: keyword.schedule.timezone,
  };
}

function DeviceIcon({ device }: Readonly<{ device: string }>) {
  return device.toLowerCase() === "mobile" ? (
    <DeviceMobile aria-hidden size={13} />
  ) : (
    <Monitor aria-hidden size={13} />
  );
}

function SwitcherButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: (element: HTMLElement) => void;
}) {
  return (
    <button
      aria-haspopup={onClick ? "menu" : undefined}
      className="inline-flex max-w-[290px] items-center gap-1.5 rounded-full border border-border bg-bg-sunken py-1 pl-2.5 pr-2 font-mono text-[11px] text-fg-muted outline-none hover:text-fg focus-visible:outline-2 focus-visible:outline-accent-solid disabled:cursor-default"
      disabled={!onClick}
      onClick={onClick ? (event) => onClick(event.currentTarget) : undefined}
      type="button"
    >
      {children}
      {onClick ? <CaretDown aria-hidden size={11} weight="bold" /> : null}
    </button>
  );
}

export function KeywordMarketSwitcher({
  addKeywordsAction,
  bulkDeleteAction,
  canCreateKeyword,
  keyword,
  projectId,
  projectMarkets,
  targets,
}: Readonly<KeywordMarketSwitcherProps>) {
  const router = useRouter();
  const { readOnly } = useProjectWriteMode();
  const { showToast } = useToast();
  const [marketAnchor, setMarketAnchor] = useState<HTMLElement | null>(null);
  const [deviceAnchor, setDeviceAnchor] = useState<HTMLElement | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const uniqueTargets = [...new Map(targets.map((target) => [target.id, target])).values()];
  const marketTargetMap = new Map<string, KeywordRow>();
  for (const target of uniqueTargets) {
    const current = marketTargetMap.get(target.location.canonicalKey);
    if (!current || target.device.toLowerCase() === keyword.device.toLowerCase()) {
      marketTargetMap.set(target.location.canonicalKey, target);
    }
  }
  const trackedMarkets = [...marketTargetMap.values()];
  const currentMarketTargets = uniqueTargets.filter(
    (target) => target.location.canonicalKey === keyword.location.canonicalKey,
  );
  const devices = [...new Set(uniqueTargets.map((target) => target.device.toLowerCase()))];
  const availableMarkets = (projectMarkets?.markets ?? []).filter(
    (market) =>
      market.status === "active" &&
      !trackedMarkets.some((target) => target.location.canonicalKey === market.canonicalKey),
  );
  const currentPair = pairLabel(keyword);

  function navigate(target: KeywordRow) {
    setMarketAnchor(null);
    setDeviceAnchor(null);
    if (target.id === keyword.id) return;
    showToast(`Now showing ${pairLabel(target)} results`, { tint: "neutral" });
    router.push(appPath(asProjectRef(projectId), "rank-tracker", target.id));
  }

  async function addMarket(market: Market) {
    setAddingKey(market.canonicalKey);
    try {
      const result = await addKeywordsAction({
        projectId,
        rows: devices.map((device) => ({
          device,
          intent: keyword.intent,
          keyword: keyword.keyword,
          locationKey: market.canonicalKey,
          tags: keyword.tags,
          targetUrl: keyword.targetUrl,
          topic: keyword.topic,
        })),
        schedule: scheduleInput(keyword),
      });
      const keywordIds = createdKeywordIds(result);
      if (keywordIds.length === 0) {
        showToast(`${marketLabel(market)} is already tracked`, { tint: "neutral" });
        return;
      }
      showToast(`Added ${marketLabel(market)}`, {
        tint: "green",
        undo: async () => {
          try {
            await bulkDeleteAction({ keywordIds, projectId });
            showToast(`Removed ${marketLabel(market)}`, { tint: "neutral" });
            router.refresh();
          } catch (error) {
            showToast(actionErrorMessage(error), { tint: "red" });
          }
        },
      });
      setMarketAnchor(null);
      router.refresh();
    } catch (error) {
      showToast(actionErrorMessage(error), { tint: "red" });
    } finally {
      setAddingKey(null);
    }
  }

  const addDisabled = readOnly || !canCreateKeyword;
  return (
    <>
      <SwitcherButton onClick={(element) => setMarketAnchor(element)}>
        <Flag aria-hidden size={13} />
        <span className="truncate" title={currentPair}>
          {currentPair}
        </span>
        {trackedMarkets.length > 1 ? (
          <span className="rounded-full bg-accent-soft px-1.5 text-accent-text">
            {trackedMarkets.length}
          </span>
        ) : null}
      </SwitcherButton>
      <SwitcherButton
        onClick={
          currentMarketTargets.length > 1 ? (element) => setDeviceAnchor(element) : undefined
        }
      >
        <DeviceIcon device={keyword.device} />
        <span className="sr-only">{keyword.device}</span>
      </SwitcherButton>
      <Menu
        anchorEl={marketAnchor}
        onClose={() => setMarketAnchor(null)}
        open={Boolean(marketAnchor)}
        slotProps={{
          list: { "aria-label": "Keyword markets", dense: true },
          paper: { sx: { border: "1px solid var(--border)", maxWidth: 290, width: 290 } },
        }}
      >
        <p className="m-0 px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">
          Tracked markets
        </p>
        {trackedMarkets.map((target) => {
          const label = pairLabel(target);
          const active = target.location.canonicalKey === keyword.location.canonicalKey;
          return (
            <MenuItem
              aria-label={`Switch to ${label}`}
              key={target.location.canonicalKey}
              onClick={() => navigate(target)}
              selected={active}
              sx={{ gap: 1.5, minWidth: 0 }}
            >
              <span className="min-w-0 flex-1 truncate" title={label}>
                {label}
              </span>
              {active ? <Check aria-hidden size={14} weight="bold" /> : null}
            </MenuItem>
          );
        })}
        {availableMarkets.length ? (
          <p className="m-0 border-t border-border-soft px-4 pb-1 pt-3 font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">
            Add a market
          </p>
        ) : null}
        {availableMarkets.map((market) => {
          const label = marketLabel(market);
          const delta = `+${devices.length} ${devices.length === 1 ? "check" : "checks"} per run`;
          const item = (
            <MenuItem
              aria-label={`Add ${label}, ${delta}`}
              disabled={addDisabled || addingKey !== null}
              key={market.id}
              onClick={() => void addMarket(market)}
              sx={{ alignItems: "center", gap: 1.5, minWidth: 0 }}
            >
              <span className="min-w-0 flex-1 truncate" title={label}>
                {label}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-fg-muted">{delta}</span>
            </MenuItem>
          );
          return readOnly ? (
            <ProjectReadOnlyTooltip key={market.id}>{item}</ProjectReadOnlyTooltip>
          ) : (
            item
          );
        })}
      </Menu>
      <Menu
        anchorEl={deviceAnchor}
        onClose={() => setDeviceAnchor(null)}
        open={Boolean(deviceAnchor)}
        slotProps={{ list: { "aria-label": "Keyword devices", dense: true } }}
      >
        {currentMarketTargets.map((target) => (
          <MenuItem
            aria-label={`Switch to ${target.device}`}
            key={target.id}
            onClick={() => navigate(target)}
            selected={target.id === keyword.id}
            sx={{ gap: 1.5 }}
          >
            <DeviceIcon device={target.device} />
            {target.device}
            {target.id === keyword.id ? <Check aria-hidden size={14} weight="bold" /> : null}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
