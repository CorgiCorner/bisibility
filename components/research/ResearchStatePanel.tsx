"use client";

import { AccentCtaLink } from "@/components/ui/AccentCtaLink";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleMark } from "@/components/ui/ModuleMark";
import { appPath } from "@/lib/routing/app-path";
import { docsLinkProps } from "@/lib/site/site";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { BinocularsIcon as Binoculars } from "@phosphor-icons/react/dist/csr/Binoculars";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { MagnifyingGlassMinusIcon as MagnifyingGlassMinus } from "@phosphor-icons/react/dist/csr/MagnifyingGlassMinus";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ResearchResultsLoading } from "./ResearchLoadingSkeletons";

export type ResearchState =
  | "budget_exhausted"
  | "empty"
  | "idle"
  | "loading"
  | "lookup_failed"
  | "needs_reauth"
  | "no_provider"
  | "unsupported_location";

type ResearchStatePanelProps = {
  cached?: boolean | null;
  charged?: boolean | null;
  scopeLabel?: string;
  mode?: string;
  onEditSearch?: () => void;
  onRetry?: () => void;
  retryLabel?: string;
  resumeLabel?: string;
  projectRef: string;
  state: ResearchState;
};

function IdleState() {
  const t = useTranslations("projectResearch.state");

  return (
    <EmptyState
      bullets={[t("idleBulletProvider"), t("idleBulletCache"), t("idleBulletGrouping")]}
      mark={<ModuleMark bordered icon={Binoculars} />}
      title={t("idleTitle")}
    />
  );
}

function LoadingState() {
  const t = useTranslations("projectResearch.state");
  return <ResearchResultsLoading ariaLabel={t("loadingAria")} />;
}

function NoProviderState({ projectRef }: Readonly<{ projectRef: string }>) {
  const t = useTranslations("projectResearch.state");

  return (
    <EmptyState
      action={
        <AccentCtaLink href={appPath(projectRef, "integrations")}>
          {t("connectAction")}
        </AccentCtaLink>
      }
      description={t("connectDescription")}
      mark={<ModuleMark bordered icon={Binoculars} />}
      title={t("connectTitle")}
    />
  );
}

function LookupFailedState({
  charged,
  onRetry,
  projectRef,
  retryLabel,
}: Readonly<{
  charged: boolean | null;
  onRetry?: () => void;
  projectRef: string;
  retryLabel: string;
}>) {
  const t = useTranslations("projectResearch.state");

  return (
    <EmptyState
      action={
        <div className="grid justify-items-center gap-3">
          {onRetry ? (
            <Button onClick={onRetry} startIcon={<ArrowsClockwise weight="regular" size={15} />}>
              {retryLabel}
            </Button>
          ) : null}
          <span className="text-fg-muted">
            {t.rich("failureAdvice", {
              integrations: (chunks) => (
                <Link
                  className="font-semibold text-accent-text hover:underline"
                  href={appPath(projectRef, "integrations")}
                >
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </div>
      }
      description={
        <span className="grid justify-items-center gap-1.5">
          <span>{t("failureRequest")}</span>
          {charged === false ? (
            <span className="inline-flex items-center gap-1 font-semibold text-green-text">
              <CheckCircle size={14} weight="regular" />
              {t("failureNotCharged")}
            </span>
          ) : null}
          {charged === true ? <span>{t("failureCharged")}</span> : null}
        </span>
      }
      icon={<ArrowsClockwise weight="regular" size={28} />}
      title={t("failureTitle")}
    />
  );
}

function EmptyResultsState({
  cached,
  scopeLabel,
  mode,
  onEditSearch,
}: Readonly<{
  cached: boolean | null;
  scopeLabel?: string;
  mode: string;
  onEditSearch?: () => void;
}>) {
  const t = useTranslations("projectResearch.state");
  const bullets = [...(mode === "auto" ? [] : [t("emptyAutoHint")]), t("emptySeedHint")];

  return (
    <EmptyState
      action={
        <div className="grid justify-items-center gap-3">
          {onEditSearch ? (
            <Button onClick={onEditSearch} variant="secondary">
              {t("editSearch")}
            </Button>
          ) : null}
          {cached == null ? null : (
            <span className="text-fg-muted">{cached ? t("cacheFree") : t("cacheCharged")}</span>
          )}
        </div>
      }
      bullets={bullets}
      icon={<MagnifyingGlassMinus weight="regular" size={28} />}
      title={scopeLabel ? t("emptyTitle", { scopeLabel }) : t("emptyTitleGeneric")}
    />
  );
}

function MessageState({
  action,
  description,
  mark,
  title,
}: Readonly<{ action?: ReactNode; description: ReactNode; mark?: ReactNode; title: string }>) {
  return (
    <EmptyState
      action={action}
      description={description}
      icon={mark ? undefined : <CheckCircle weight="regular" size={28} />}
      mark={mark}
      title={title}
    />
  );
}

export function ResearchStatePanel({
  cached = null,
  charged = null,
  scopeLabel,
  mode = "auto",
  onEditSearch,
  onRetry,
  retryLabel,
  resumeLabel,
  projectRef,
  state,
}: Readonly<ResearchStatePanelProps>) {
  const t = useTranslations("projectResearch.state");
  if (state === "idle") return <IdleState />;
  if (state === "loading") return <LoadingState />;
  if (state === "no_provider") return <NoProviderState projectRef={projectRef} />;
  if (state === "budget_exhausted") {
    return (
      <MessageState
        action={
          <Link
            className="font-semibold text-accent-text hover:underline"
            href={appPath(projectRef, "settings#provider-usage")}
          >
            {t("budgetAction")}
          </Link>
        }
        description={t.rich("budgetDescription", {
          docs: (chunks) => (
            <Link
              className="font-semibold text-accent-text hover:underline"
              href="/docs/integrations#budget-cap"
              {...docsLinkProps("/docs/integrations#budget-cap")}
            >
              {chunks}
            </Link>
          ),
          resumeLabel: resumeLabel ?? t("defaultResume"),
        })}
        title={t("budgetTitle")}
      />
    );
  }
  if (state === "needs_reauth") {
    return (
      <MessageState
        action={
          <AccentCtaLink href={appPath(projectRef, "integrations")}>
            {t("reauthAction")}
          </AccentCtaLink>
        }
        description={t("reauthDescription")}
        mark={<ModuleMark bordered icon={Binoculars} />}
        title={t("reauthTitle")}
      />
    );
  }
  if (state === "unsupported_location") {
    return (
      <MessageState
        description={t("unsupportedDescription", {
          scopeLabel: scopeLabel ?? t("unsupportedTitle").toLowerCase(),
        })}
        title={t("unsupportedTitle")}
      />
    );
  }
  if (state === "lookup_failed") {
    return (
      <LookupFailedState
        charged={charged}
        onRetry={onRetry}
        projectRef={projectRef}
        retryLabel={retryLabel ?? t("retry")}
      />
    );
  }
  return (
    <EmptyResultsState
      cached={cached}
      mode={mode}
      onEditSearch={onEditSearch}
      scopeLabel={scopeLabel}
    />
  );
}
