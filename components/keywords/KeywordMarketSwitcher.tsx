"use client";

import { MarketCombobox, type MarketComboboxOption } from "@/components/markets/MarketCombobox";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
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

type KeywordMarketPayload =
  | { kind: "navigate"; target: KeywordRow }
  | { kind: "add"; market: Market };

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
  const { readOnly, readOnlyReason } = useProjectWriteMode();
  const { showToast } = useToast();
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
  const addDisabled = readOnly || !canCreateKeyword;

  function navigate(target: KeywordRow) {
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
      router.refresh();
    } catch (error) {
      showToast(actionErrorMessage(error), { tint: "red" });
    } finally {
      setAddingKey(null);
    }
  }

  const trackedOptions: MarketComboboxOption<KeywordMarketPayload>[] = trackedMarkets.map(
    (target) => ({
      ariaLabel: `Switch to ${pairLabel(target)}`,
      countryCode: target.location.countryCode,
      languageCode: target.location.hl,
      languageLabel: target.location.languageLabel ?? target.location.hl,
      locationLabel: target.location.displayName,
      payload: { kind: "navigate", target },
      value: target.location.canonicalKey,
    }),
  );

  const catalogOptions: MarketComboboxOption<KeywordMarketPayload>[] = availableMarkets.map(
    (market) => {
      const label = marketLabel(market);
      const delta = `+${devices.length} ${devices.length === 1 ? "check" : "checks"} per run`;
      return {
        ariaLabel: `Add ${label}, ${delta}`,
        countryCode: market.countryCode,
        disabled: addDisabled || addingKey !== null,
        languageCode: market.languageCode,
        languageLabel: market.languageLabel,
        locationLabel: market.displayName,
        payload: { kind: "add", market },
        secondary: delta,
        tooltip: readOnly ? readOnlyReason : undefined,
        value: market.canonicalKey,
      };
    },
  );

  function handleMarketChange(payload: KeywordMarketPayload) {
    if (payload.kind === "navigate") navigate(payload.target);
    else void addMarket(payload.market);
  }

  return (
    <>
      <MarketCombobox
        ariaLabel={currentPair}
        catalogLabel="Add a market"
        catalogMarkets={catalogOptions}
        catalogSearchOnly={false}
        leadingIcon={<Flag aria-hidden size={13} />}
        onChange={handleMarketChange}
        trackedLabel="Tracked markets"
        trackedMarkets={trackedOptions}
        triggerClassName="max-w-[290px] rounded-full border-border bg-bg-sunken py-1 pl-2.5 pr-2 font-mono text-[11px] text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent-solid"
        triggerTitle={currentPair}
        value={keyword.location.canonicalKey}
      />
      <SwitcherButton
        onClick={
          currentMarketTargets.length > 1 ? (element) => setDeviceAnchor(element) : undefined
        }
      >
        <DeviceIcon device={keyword.device} />
        <span className="sr-only">{keyword.device}</span>
      </SwitcherButton>
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
