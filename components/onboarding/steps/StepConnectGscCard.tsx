"use client";

import { Button, InlineCallout, InlineCode, MenuSelect } from "@/components/ui";
import type { GoogleOAuthSetup } from "@/lib/integrations/types";
import { gscInstallUrl } from "@/lib/providers/analytics/gsc-install-url";
import { docsLinkProps } from "@/lib/site/site";
import {
  ArrowUpRightIcon as ArrowUpRight,
  CheckCircleIcon as CheckCircle,
  MagnifyingGlassIcon as MagnifyingGlass,
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
  projectId?: string | null;
  /** App-relative onboarding return path the OAuth roundtrip comes back to (step 5). */
  returnPath?: string;
};

function connectedMessage(propertyLabel?: string | null) {
  return propertyLabel ? `Search Console connected: ${propertyLabel}` : "Search Console connected.";
}

export function StepConnectGscCard({
  completePropertySelection,
  configured,
  connectedPropertyLabel,
  googleOAuth,
  justConnected = false,
  projectId,
  returnPath,
}: Readonly<StepConnectGscCardProps>) {
  const [property, setProperty] = useState(googleOAuth?.properties[0]?.value ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const connected = (justConnected || Boolean(connectedPropertyLabel)) && !googleOAuth;
  const href = configured && projectId ? gscInstallUrl(projectId, returnPath) : null;
  const selected = googleOAuth?.properties.find((option) => option.value === property);

  async function selectProperty() {
    if (!completePropertySelection || !projectId || !property) return;
    setError(null);
    setPending(true);
    try {
      await completePropertySelection({ projectId, property });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search Console connection failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mb-5 rounded-xl border border-border-strong bg-transparent p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-bg-elev text-accent-text">
              <MagnifyingGlass aria-hidden size={17} weight="bold" />
            </span>
            <span className="text-[15px] font-semibold text-fg">Google Search Console</span>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-text">
              Recommended
            </span>
            <span className="rounded-full bg-bg-elev px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
              free
            </span>
          </div>
          <p className="m-0 mt-2 text-[13px] leading-[1.5] text-fg-muted">
            Connect Google first, then choose one of the verified properties returned by Search
            Console. No API key is needed.
          </p>
          {connected ? (
            <p className="m-0 mt-3 inline-flex items-center gap-2 rounded-[9px] bg-bg-elev px-3 py-2 text-[12.5px] font-semibold text-green-text">
              <CheckCircle aria-hidden size={15} weight="fill" />
              {connectedMessage(connectedPropertyLabel)}
            </p>
          ) : null}
          {googleOAuth ? (
            <div className="mt-3 flex max-w-xl flex-col gap-3 rounded-[11px] border border-border-strong bg-bg-elev p-3.5">
              <div>
                <p className="m-0 text-[12.5px] font-semibold text-fg">
                  Select a verified property
                </p>
                <p className="m-0 mt-1 text-[11.5px] leading-5 text-fg-muted">
                  The exact Search Console property ID will be saved to this project.
                </p>
              </div>
              {googleOAuth.properties.length > 0 ? (
                <>
                  <MenuSelect
                    ariaLabel="Search Console property"
                    onChange={setProperty}
                    options={googleOAuth.properties}
                    triggerClassName="min-h-[42px] w-full justify-between"
                    value={property}
                  />
                  {selected ? (
                    <span className="break-all rounded-[9px] bg-bg-sunken px-3 py-2 font-mono text-[12px] text-fg">
                      {selected.value}
                    </span>
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
                </>
              ) : (
                <p className="m-0 flex gap-2 rounded-[9px] bg-bg-sunken px-3 py-2.5 text-[12px] leading-5 text-fg-muted">
                  <WarningCircle
                    aria-hidden
                    className="mt-0.5 shrink-0 text-yellow-text"
                    size={15}
                  />
                  {googleOAuth.error ??
                    "This account has no verified Search Console properties. Verify one or connect a different Google account."}
                </p>
              )}
              {error ? (
                <p className="m-0 text-[12px] text-red-text" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}
          {!configured ? (
            <InlineCallout className="mt-3" tint="yellow">
              Search Console OAuth is not configured on this instance. Set{" "}
              <InlineCode>GOOGLE_CLIENT_ID</InlineCode> and{" "}
              <InlineCode>GOOGLE_CLIENT_SECRET</InlineCode>. See the{" "}
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
          ) : null}
        </div>
        {href && !connected ? (
          <Button className="flex-none" href={href} variant={googleOAuth ? "secondary" : "primary"}>
            {googleOAuth ? "Use another account" : "Connect Search Console"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
