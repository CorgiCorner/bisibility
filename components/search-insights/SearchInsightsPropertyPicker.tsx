"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toast-context";
import type {
  ArchivedSearchInsightsProperty,
  SearchInsightsPropertyOption,
} from "@/lib/actions/search-insights";
import { googleInstallUrl } from "@/lib/providers/analytics/google-install-url";
import { asProjectRef, searchConsolePath } from "@/lib/routing/app-path";
import { searchSyncPreflightFacts } from "@/lib/search-insights/sync/plan";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { GlobeHemisphereWestIcon as GlobeHemisphereWest } from "@phosphor-icons/react/dist/csr/GlobeHemisphereWest";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import {
  SearchInsightsMenu,
  SearchInsightsMenuNotice,
  SearchInsightsMenuSkeleton,
} from "./SearchInsightsMenu";
import { SearchInsightsPropertyMenuGroups } from "./SearchInsightsPropertyMenuGroups";
import type { PropertyPickerProps } from "./SearchInsightsPropertyPicker.types";
import { SearchInsightsPropertyPickerFooter } from "./SearchInsightsPropertyPickerFooter";
import { groupSearchInsightsProperties } from "./SearchInsightsPropertyPickerGrouping";
import { PropertyKindPill, PropertyName } from "./SearchInsightsPropertyRow";
import { searchInsightsPropertyViewPath } from "./search-insights-return-path";

export function SearchInsightsPropertyPicker({
  connection,
  loadPropertiesAction,
  projectDomain,
  projectId,
  preserveGa4OauthSelection = false,
  selectPropertyAction,
  syncPlan = { daysTotal: 488, pace: "normal", retentionMonths: 16 },
  viewedProperty,
}: Readonly<PropertyPickerProps>) {
  const t = useTranslations("projectSearchInsights.copy");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [options, setOptions] = useState<readonly SearchInsightsPropertyOption[] | null>(null);
  const [archived, setArchived] = useState<readonly ArchivedSearchInsightsProperty[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingProperty, setPendingProperty] = useState<SearchInsightsPropertyOption | null>(null);
  const [viewPending, startViewTransition] = useTransition();
  const [selectPending, startSelectTransition] = useTransition();
  const navigationPending = viewPending || selectPending;
  const property = connection.property;
  const displayedProperty = viewedProperty ?? property;
  const connectHref = googleInstallUrl({
    projectId,
    provider: "gsc",
    returnPath: searchConsolePath(asProjectRef(projectId)),
  });
  const needsConnection =
    connection.status === "not_connected" || connection.status === "needs_reauth";
  const searchConsoleHref = (() => {
    if (!displayedProperty) return undefined;
    const url = new URL("https://search.google.com/search-console");
    url.searchParams.set("resource_id", displayedProperty.value);
    return url.toString();
  })();

  // The account's property list is a live Google call, so it is fetched when the menu opens
  // rather than on every page render. Only a non-empty list is remembered: a lost consent, a
  // failed call and an account with nothing granted say different things, and reopening the menu
  // retries all three.
  async function openMenu(anchor: HTMLElement) {
    setAnchorEl(anchor);
    if (options || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await loadPropertiesAction({ projectId });
      setArchived(result.archived ?? []);
      if (result.requiresReauth) {
        setNotice(t("propertiesReconnect"));
        return;
      }
      if (result.error) {
        setNotice(result.error);
        return;
      }
      if (result.properties.length === 0) {
        setNotice(t("propertiesEmpty"));
        return;
      }
      setOptions(result.properties);
    } catch (error) {
      setNotice(actionErrorMessage(error, t("propertiesFailed")));
    } finally {
      setBusy(false);
    }
  }

  function pick(option: SearchInsightsPropertyOption) {
    if (option.value === property?.value || selectPending) return;
    startSelectTransition(async () => {
      try {
        const result = await selectPropertyAction({ projectId, property: option.value });
        if (result.status === "reauth_required") {
          showToast(t("reauthRequired"), { severity: "connection" });
          return;
        }
        router.refresh();
      } catch (error) {
        showToast(actionErrorMessage(error, t("selectFailed")), { severity: "error" });
      } finally {
        setPendingProperty(null);
      }
    });
  }

  const groupedOptions = useMemo(
    () =>
      groupSearchInsightsProperties({
        active: property,
        archived,
        options: options ?? [],
        projectDomain: projectDomain ?? "",
      }),
    [archived, options, projectDomain, property],
  );
  function requestChange(option: SearchInsightsPropertyOption) {
    setAnchorEl(null);
    if (option.value !== property?.value) setPendingProperty(option);
  }
  function viewProperty(value: string) {
    setAnchorEl(null);
    if (value === displayedProperty?.value || viewPending) return;
    startViewTransition(() => {
      router.push(
        searchInsightsPropertyViewPath(pathname, searchParams, value, preserveGa4OauthSelection),
      );
    });
  }

  return (
    <>
      <Button
        aria-expanded={!needsConnection ? Boolean(anchorEl) : undefined}
        aria-haspopup={!needsConnection ? "listbox" : undefined}
        aria-label={t("propertyMenuLabel")}
        className="max-w-105"
        href={needsConnection ? connectHref : undefined}
        loading={navigationPending}
        loadingIndicator={
          <GlobeHemisphereWest
            weight="regular"
            aria-hidden
            className="animate-spin text-fg-muted"
            size={15}
          />
        }
        onClick={!needsConnection ? (event) => void openMenu(event.currentTarget) : undefined}
        size="sm"
        startIcon={
          <GlobeHemisphereWest weight="regular" aria-hidden className="text-fg-muted" size={15} />
        }
        variant="secondary"
      >
        <span className="flex min-w-0 items-center gap-2">
          {displayedProperty ? (
            <PropertyName name={displayedProperty.displayName} value={displayedProperty.value} />
          ) : (
            <span className="text-ui-caption">
              {needsConnection ? t("noPropertyLabel") : t("chooseProperty")}
            </span>
          )}
          {displayedProperty ? <PropertyKindPill kind={displayedProperty.kind} /> : null}
          <CaretDown aria-hidden className="shrink-0 text-fg-muted" size={11} weight="regular" />
        </span>
      </Button>
      {searchConsoleHref ? (
        <Button
          endIcon={<ArrowSquareOut aria-hidden size={14} weight="regular" />}
          href={searchConsoleHref}
          rel="noreferrer noopener"
          size="sm"
          target="_blank"
          variant="secondary"
        >
          {t("openInSearchConsole")}
        </Button>
      ) : null}
      <SearchInsightsMenu
        anchorEl={anchorEl}
        ariaLabel={t("propertyMenuLabel")}
        onClose={() => setAnchorEl(null)}
        wide
      >
        {busy ? <SearchInsightsMenuSkeleton ariaLabel={t("propertiesLoading")} /> : null}
        {!busy && notice ? <SearchInsightsMenuNotice>{notice}</SearchInsightsMenuNotice> : null}
        {!busy ? (
          <SearchInsightsPropertyMenuGroups
            active={property}
            archived={groupedOptions.archived}
            displayed={displayedProperty}
            matching={groupedOptions.matching}
            onActiveSelect={(option) => viewProperty(option.value)}
            onArchivedSelect={(option) => viewProperty(option.value)}
            onPropertySelect={requestChange}
            projectDomain={projectDomain ?? ""}
          />
        ) : null}
        <SearchInsightsPropertyPickerFooter projectId={projectId} />
      </SearchInsightsMenu>
      <Modal
        footer={
          <>
            <Button onClick={() => setPendingProperty(null)} variant="secondary">
              {t("cancel")}
            </Button>
            <Button
              loading={selectPending}
              onClick={() => pendingProperty && pick(pendingProperty)}
              variant="primary"
            >
              {t("switchProperty")}
            </Button>
          </>
        }
        onClose={() => setPendingProperty(null)}
        open={pendingProperty !== null}
        size="sm"
        title={t("switchPropertyTitle")}
      >
        <p className="m-0 text-[13px] leading-[1.55] text-fg-muted">
          {t("switchPropertyBody", {
            currentProperty: property?.displayName ?? "",
            preflight: syncPreflightCopy(syncPlan, t),
            property: pendingProperty?.displayName ?? "",
          })}
        </p>
      </Modal>
    </>
  );
}

function syncPreflightCopy(
  plan: Parameters<typeof searchSyncPreflightFacts>[0],
  t: ReturnType<typeof useTranslations<"projectSearchInsights.copy">>,
) {
  const facts = searchSyncPreflightFacts(plan);
  const roundedHours = Math.round(facts.durationHours);
  if (roundedHours < 24) {
    return t("syncPreflightHours", {
      hours: roundedHours,
      months: facts.retentionMonths,
      requests: facts.requests,
    });
  }
  return t("syncPreflightDays", {
    days: Math.round(facts.durationHours / 24),
    months: facts.retentionMonths,
    requests: facts.requests,
  });
}
