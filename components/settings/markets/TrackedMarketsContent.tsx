"use client";

import { MarketPicker, type MarketPickerChoice } from "@/components/markets/MarketPicker";
import { DeveloperActionsMenu } from "@/components/settings/developers/DeveloperActionsMenu";
import {
  AppDrawer,
  Button,
  Card,
  ExternalLink,
  Modal,
  MonoText,
  SectionTitle,
  Switch,
} from "@/components/ui";
import type { AddProjectMarketsResult, ProjectMarketChoice } from "@/lib/actions/project-markets";
import { formatMoneyCents } from "@/lib/format/money";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { MARKETING_URL } from "@/lib/site/site";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type AddMarketsAction = (input: {
  choices: ProjectMarketChoice[];
  projectId: string;
}) => Promise<AddProjectMarketsResult>;
export type SetMarketEnabledAction = (input: {
  enabled: boolean;
  marketId: string;
  projectId: string;
}) => Promise<unknown>;
export type RemoveMarketAction = (input: {
  marketId: string;
  projectId: string;
}) => Promise<unknown>;

type TrackedMarketsContentProps = {
  addMarkets: AddMarketsAction;
  canEdit: boolean;
  canRemove: boolean;
  markets: ProjectMarketsView;
  removeMarket: RemoveMarketAction;
  setMarketEnabled: SetMarketEnabledAction;
};

function marketLabel(market: ProjectMarketsView["markets"][number]) {
  return `${market.displayName} / ${market.languageLabel}`;
}

function marketChoices(choices: readonly MarketPickerChoice[]): ProjectMarketChoice[] {
  return choices.map((choice) => ({
    canonicalKey: choice.canonicalKey,
    countryCode: choice.countryCode,
    kind: choice.kind,
    languageCode: choice.language.code,
  }));
}

function costLabel(costCents: number | null, suffix = "") {
  return costCents == null ? "Cost unavailable" : `~ ${formatMoneyCents(costCents)}/month${suffix}`;
}

export function TrackedMarketsContent({
  addMarkets,
  canEdit,
  canRemove,
  markets,
  removeMarket,
  setMarketEnabled,
}: Readonly<TrackedMarketsContentProps>) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removing, setRemoving] = useState<ProjectMarketsView["markets"][number] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const full = markets.markets.length >= markets.maxMarkets;
  const activeCount = markets.markets.filter((market) => market.status === "active").length;

  async function commit(choices: readonly MarketPickerChoice[]) {
    setError(null);
    try {
      const result = await addMarkets({
        choices: marketChoices(choices),
        projectId: markets.projectId,
      });
      if (!result.ok) {
        setError(`This project can track up to ${result.maxMarkets} markets.`);
        return;
      }
      setPickerOpen(false);
      router.refresh();
    } catch (cause) {
      setError(actionErrorMessage(cause, "Markets could not be added."));
    }
  }

  async function toggle(market: ProjectMarketsView["markets"][number], enabled: boolean) {
    setError(null);
    setPendingId(market.id);
    try {
      await setMarketEnabled({ enabled, marketId: market.id, projectId: markets.projectId });
      router.refresh();
    } catch (cause) {
      setError(actionErrorMessage(cause, "Market status could not be updated."));
    } finally {
      setPendingId(null);
    }
  }

  async function remove() {
    if (!removing) return;
    setError(null);
    setPendingId(removing.id);
    try {
      await removeMarket({ marketId: removing.id, projectId: markets.projectId });
      setRemoving(null);
      router.refresh();
    } catch (cause) {
      setError(actionErrorMessage(cause, "Market could not be removed."));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card className="max-w-[760px]" data-tracked-markets-card="" size="lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <SectionTitle>Tracked markets</SectionTitle>
          <p className="m-0 mt-1 text-[12.5px] leading-[1.55] text-fg-muted">
            Each market is a location and language pair. Every keyword is checked in each enabled
            market.
          </p>
        </div>
        <Button disabled={!canEdit || full} onClick={() => setPickerOpen(true)} size="sm">
          Add market
        </Button>
      </div>
      <AppDrawer
        description="Pick a location, then the languages to track there."
        onClose={() => setPickerOpen(false)}
        open={pickerOpen}
        title="Add market"
      >
        <div className="[&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0">
          <MarketPicker
            maxMarkets={markets.maxMarkets}
            onCancel={() => setPickerOpen(false)}
            onCommit={commit}
            projectId={markets.projectId}
            trackedCanonicalKeys={markets.markets.map((market) => market.canonicalKey)}
          />
        </div>
      </AppDrawer>
      {error ? <p className="m-0 mt-4 text-[12px] text-red-text">{error}</p> : null}
      {markets.markets.length ? (
        <>
          <ul className="m-0 mt-5 list-none divide-y divide-border-soft border-y border-border-soft p-0">
            {markets.markets.map((market) => {
              const active = market.status === "active";
              const pending = pendingId === market.id;
              return (
                <li
                  className={`flex flex-wrap items-center gap-x-5 gap-y-3 px-1 py-4 ${active ? "" : "opacity-60"}`}
                  key={market.id}
                >
                  <div className="min-w-[190px] flex-1">
                    <p className="m-0 text-[13px] font-semibold text-fg">{marketLabel(market)}</p>
                    {!market.researchAvailable ? (
                      <p className="m-0 mt-1 text-[11.5px] text-fg-muted">no volume/KD</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-fg-muted">
                    <MonoText size="sm">
                      {active ? `${markets.perMarketChecks} checks per run` : "Paused"}
                    </MonoText>
                    <MonoText size="sm">
                      {costLabel(market.monthlyCostCents, active ? "" : " if enabled")}
                    </MonoText>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Switch
                      aria-label={`${active ? "Pause" : "Resume"} ${marketLabel(market)}`}
                      checked={active}
                      className="min-h-10 min-w-10 border-0 bg-transparent p-1"
                      disabled={!canEdit || pending}
                      onChange={(event) => void toggle(market, event.currentTarget.checked)}
                    />
                    {canRemove ? (
                      <DeveloperActionsMenu
                        ariaLabel={`Actions for ${marketLabel(market)}`}
                        items={[
                          {
                            danger: true,
                            label: "Remove market",
                            onSelect: () => setRemoving(market),
                          },
                        ]}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <MonoText size="sm">
              {activeCount} markets active / {activeCount * markets.perMarketChecks} checks per run
              / {costLabel(markets.monthlyCostCents)}
            </MonoText>
            <ExternalLink
              className="text-[12px] font-medium text-accent-text hover:underline"
              href={`${MARKETING_URL}/rank-tracking-cost-calculator`}
            >
              Estimate provider cost
            </ExternalLink>
          </div>
        </>
      ) : (
        <p className="m-0 mt-5 border-t border-border-soft pt-5 text-[12.5px] leading-[1.55] text-fg-muted">
          No markets yet. Add your first location and language pair to start tracking.
        </p>
      )}
      <Modal
        footer={
          <>
            <Button
              disabled={pendingId != null}
              onClick={() => setRemoving(null)}
              size="sm"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              loading={pendingId === removing?.id}
              onClick={() => void remove()}
              size="sm"
              variant="destructive"
            >
              Remove market
            </Button>
          </>
        }
        onClose={() => setRemoving(null)}
        open={removing != null}
        size="sm"
        title={removing ? `Remove ${marketLabel(removing)}?` : "Remove market"}
      >
        <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">
          Keywords stop being checked in this market. Collected history stays visible on keyword
          pages and in Checks.
        </p>
      </Modal>
    </Card>
  );
}
