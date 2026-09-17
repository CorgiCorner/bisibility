"use client";

import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { InlineCallout, InlineCode } from "@/components/ui/InlineCallout";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { StatusPill } from "@/components/ui/StatusPill";
import type { GoogleOAuthSetup, GooglePropertySaveResult } from "@/lib/integrations/types";
import { gscInstallUrl } from "@/lib/providers/analytics/gsc-install-url";
import { docsLinkProps } from "@/lib/site/site";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

type StepConnectGscCardProps = {
  completePropertySelection?: (input: {
    projectId: string;
    property: string;
  }) => Promise<{ property: string }>;
  configured: boolean;
  connectedPropertyLabel?: string | null;
  googleOAuth?: GoogleOAuthSetup | null;
  justConnected?: boolean;
  loadStoredProperties?: (input: {
    projectId: string;
    provider: "gsc";
  }) => Promise<GoogleOAuthSetup>;
  projectId?: string | null;
  /** App-relative onboarding return path the OAuth roundtrip comes back to (step 2). */
  returnPath?: string;
  saveStoredProperty?: (input: {
    projectId: string;
    property: string;
    provider: "gsc";
  }) => Promise<GooglePropertySaveResult>;
};

export function StepConnectGscSetupNotice({ configured }: Readonly<{ configured: boolean }>) {
  const t = useTranslations("onboarding.searchConsole");
  if (configured) return null;
  return (
    <InlineCallout className="mt-2 w-full" tint="yellow">
      {t.rich("notConfigured.message", {
        clientId: (chunks) => <InlineCode>{chunks}</InlineCode>,
        clientSecret: (chunks) => <InlineCode>{chunks}</InlineCode>,
        guide: (chunks) => (
          <a
            className="inline-flex items-center gap-0.5 font-medium text-accent-text hover:underline"
            href="/docs/integrations#analytics-sources"
            {...docsLinkProps("/docs/integrations#analytics-sources")}
          >
            {chunks}
            <ArrowUpRight aria-hidden size={13} weight="regular" />
          </a>
        ),
      })}
    </InlineCallout>
  );
}

export function StepConnectGscCard({
  completePropertySelection,
  configured,
  connectedPropertyLabel,
  googleOAuth,
  justConnected = false,
  loadStoredProperties,
  projectId,
  returnPath,
  saveStoredProperty,
}: Readonly<StepConnectGscCardProps>) {
  const t = useTranslations("onboarding.searchConsole");
  const [setup, setSetup] = useState<GoogleOAuthSetup | null>(googleOAuth ?? null);
  const [selectionSource, setSelectionSource] = useState<"pending" | "stored" | null>(
    googleOAuth ? "pending" : null,
  );
  const [property, setProperty] = useState(setup?.properties[0]?.value ?? "");
  const [propertyDrawerDismissed, setPropertyDrawerDismissed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const connected =
    (justConnected || Boolean(connectedPropertyLabel)) && selectionSource !== "pending";
  const href = configured && projectId ? gscInstallUrl(projectId, returnPath) : null;
  const selected = setup?.properties.find((option) => option.value === property);

  async function changeProperty() {
    if (!loadStoredProperties || !projectId) return;
    setError(null);
    setPending(true);
    try {
      const loaded = await loadStoredProperties({ projectId, provider: "gsc" });
      setSetup(loaded);
      setSelectionSource("stored");
      setProperty(
        loaded.properties.some((option) => option.value === loaded.preferredProperty)
          ? (loaded.preferredProperty ?? "")
          : (loaded.properties[0]?.value ?? ""),
      );
      setPropertyDrawerDismissed(false);
    } catch {
      setError(t("errors.propertiesLoad"));
    } finally {
      setPending(false);
    }
  }

  async function selectProperty() {
    if (!projectId || !property || !selectionSource) return;
    setError(null);
    setPending(true);
    try {
      const result =
        selectionSource === "stored"
          ? await saveStoredProperty?.({ projectId, property, provider: "gsc" })
          : await completePropertySelection?.({ projectId, property });
      if (!result) throw new Error(t("errors.selectionUnavailable"));
      if ("status" in result && result.status === "reauth_required") {
        setSetup({
          error: t("errors.reconnect"),
          properties: [],
          provider: "gsc",
          requiresReauth: true,
        });
        return;
      }
      setSetup(null);
      setSelectionSource(null);
      setPropertyDrawerDismissed(true);
      router.refresh();
    } catch {
      setError(t("errors.connectionFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      data-analytics-block
      className="flex h-full w-full flex-col rounded-card border border-border-strong bg-transparent p-4"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex flex-col items-start gap-2">
            <span className="text-sm font-semibold text-fg">{t("name")}</span>
            {connected || configured ? (
              <StatusPill
                label={connected ? t("status.connected") : t("status.ready")}
                size="sm"
                status={connected ? "connected" : "ready"}
              />
            ) : null}
          </span>
        </div>
        <p className="m-0 mt-2 text-[13px] leading-[1.5] text-fg-muted">{t("description")}</p>
      </div>
      {setup || (connected && loadStoredProperties) || href ? (
        <div className="mt-4 flex flex-none justify-end">
          {setup ? (
            <Button
              className="w-full sm:w-auto"
              onClick={() => setPropertyDrawerDismissed(false)}
              type="button"
              variant="secondary"
            >
              {t("actions.select")}
            </Button>
          ) : connected && loadStoredProperties ? (
            <Button
              className="w-full sm:w-auto"
              loading={pending}
              loadingLabel={t("actions.loading")}
              onClick={() => void changeProperty()}
              type="button"
              variant="secondary"
            >
              {t("actions.change")}
            </Button>
          ) : (
            <Button className="w-full sm:w-auto" href={href ?? undefined} variant="secondary">
              {connected ? t("actions.change") : t("actions.connect")}
            </Button>
          )}
        </div>
      ) : null}
      {setup ? (
        <AppDrawer
          description={t("drawer.description")}
          footer={
            <div className="flex flex-wrap justify-end gap-2.5">
              {href ? (
                <Button href={href} variant="secondary">
                  {t("actions.otherAccount")}
                </Button>
              ) : null}
              <Button
                disabled={!property}
                loading={pending}
                loadingLabel={t("actions.connecting")}
                onClick={() => void selectProperty()}
                type="button"
              >
                {t("actions.useSelected")}
              </Button>
            </div>
          }
          onClose={() => setPropertyDrawerDismissed(true)}
          open={!propertyDrawerDismissed}
          title={t("drawer.title")}
        >
          {setup.properties.length > 0 ? (
            <div className="flex flex-col gap-3" data-analytics-block>
              <MenuSelect
                ariaLabel={t("drawer.property")}
                onChange={setProperty}
                options={setup.properties}
                triggerClassName="min-h-[42px] w-full justify-between"
                value={property}
              />
              {selected ? (
                <span className="break-all rounded-control bg-bg-sunken px-3 py-2 text-[12px] text-fg">
                  {selected.value}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="m-0 flex gap-2 rounded-control bg-bg-sunken px-3 py-2.5 text-[12px] leading-5 text-fg-muted">
              <WarningCircle
                aria-hidden
                className="mt-0.5 shrink-0 text-yellow-text"
                size={15}
                weight="regular"
              />
              {setup.error ?? t("drawer.noProperties")}
            </p>
          )}
          {error ? (
            <p className="m-0 mt-3 text-[12px] text-red-text" role="alert">
              {error}
            </p>
          ) : null}
        </AppDrawer>
      ) : null}
    </section>
  );
}
