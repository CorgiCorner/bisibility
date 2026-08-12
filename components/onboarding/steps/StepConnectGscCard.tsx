"use client";

import {
  AppDrawer,
  Button,
  InlineCallout,
  InlineCode,
  MenuSelect,
  StatusPill,
} from "@/components/ui";
import type { GoogleOAuthSetup, GooglePropertySaveResult } from "@/lib/integrations/types";
import { gscInstallUrl } from "@/lib/providers/analytics/gsc-install-url";
import { docsLinkProps } from "@/lib/site/site";
import {
  ArrowUpRightIcon as ArrowUpRight,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
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
  if (configured) return null;
  return (
    <InlineCallout className="mb-3 w-full" tint="yellow">
      Search Console OAuth is not configured on this instance. Set{" "}
      <InlineCode>GOOGLE_CLIENT_ID</InlineCode> and <InlineCode>GOOGLE_CLIENT_SECRET</InlineCode>.
      See the{" "}
      <a
        className="inline-flex items-center gap-0.5 font-medium text-accent-text hover:underline"
        href="/docs/integrations#analytics-sources"
        {...docsLinkProps("/docs/integrations#analytics-sources")}
      >
        setup guide
        <ArrowUpRight aria-hidden size={13} weight="bold" />
      </a>{" "}
      for how to create them.
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
      setError("Properties could not be loaded. Try again or reconnect the account.");
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
      if (!result) throw new Error("Property selection is unavailable.");
      if ("status" in result && result.status === "reauth_required") {
        setSetup({
          error: "Reconnect the Google account to change its property.",
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search Console connection failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex h-full flex-col rounded-[14px] border border-border-strong bg-transparent p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex flex-col items-start gap-2">
            <span className="text-sm font-semibold text-fg">Search Console</span>
            <StatusPill
              label={connected ? "Connected" : configured ? "Ready to connect" : "Setup required"}
              size="sm"
              status={connected ? "connected" : "ready"}
            />
          </span>
        </div>
        <p className="m-0 mt-2 text-[13px] leading-[1.5] text-fg-muted">
          Free - import real queries, clicks, and impressions. No API key is needed.
        </p>
      </div>
      {setup || (connected && loadStoredProperties) || href ? (
        <div className="mt-4 flex-none">
          {setup ? (
            <Button
              className="w-full"
              onClick={() => setPropertyDrawerDismissed(false)}
              type="button"
              variant="secondary"
            >
              Select property
            </Button>
          ) : connected && loadStoredProperties ? (
            <Button
              className="w-full"
              loading={pending}
              loadingLabel="Loading properties…"
              onClick={() => void changeProperty()}
              type="button"
              variant="secondary"
            >
              Change property
            </Button>
          ) : (
            <Button className="w-full" href={href ?? undefined} variant="secondary">
              {connected ? "Change property" : "Connect"}
            </Button>
          )}
        </div>
      ) : null}
      {setup ? (
        <AppDrawer
          description="Choose a property returned by your connected Google account."
          footer={
            <div className="flex flex-wrap justify-end gap-2.5">
              {href ? (
                <Button href={href} variant="secondary">
                  Use another account
                </Button>
              ) : null}
              <Button
                disabled={!property}
                loading={pending}
                loadingLabel="Connecting…"
                onClick={() => void selectProperty()}
                type="button"
              >
                Use selected property
              </Button>
            </div>
          }
          onClose={() => setPropertyDrawerDismissed(true)}
          open={!propertyDrawerDismissed}
          title="Select a Search Console property"
        >
          {setup.properties.length > 0 ? (
            <div className="flex flex-col gap-3">
              <MenuSelect
                ariaLabel="Search Console property"
                onChange={setProperty}
                options={setup.properties}
                triggerClassName="min-h-[42px] w-full justify-between"
                value={property}
              />
              {selected ? (
                <span className="break-all rounded-[9px] bg-bg-sunken px-3 py-2 font-mono text-[12px] text-fg">
                  {selected.value}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="m-0 flex gap-2 rounded-[9px] bg-bg-sunken px-3 py-2.5 text-[12px] leading-5 text-fg-muted">
              <WarningCircle aria-hidden className="mt-0.5 shrink-0 text-yellow-text" size={15} />
              {setup.error ??
                "This account has no verified Search Console properties. Verify one or connect a different Google account."}
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
