"use client";

import type { BillingInterestInput } from "@/app/app/(workspace)/[project]/settings/actions";
import { SettingsSection, USAGE_BILLING_TARGET } from "@/components/settings/SettingsSection";
import { Button, MonoText } from "@/components/ui";
import type { WaitlistSource } from "@/lib/landing/waitlist-schema";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import {
  BellIcon as Bell,
  CloudIcon as Cloud,
  HardDrivesIcon as HardDrives,
  PaperPlaneTiltIcon as PaperPlaneTilt,
} from "@phosphor-icons/react";
import { type FormEvent, type ReactNode, useCallback, useState, useTransition } from "react";

export type UsageBillingVariant = "cloud-beta" | "self-host";

export type UsageBillingSectionProps = {
  email: string;
  projectId: string;
  submitInterest: (input: BillingInterestInput) => Promise<{ email: string; ok: boolean }>;
  /** Deployment-derived default; the chips let the user preview the other plan. */
  variant: UsageBillingVariant;
};

type VariantCopy = {
  body: string;
  description: string;
  source: WaitlistSource;
  submitLabel: string;
  success: string;
};

const copyByVariant: Record<UsageBillingVariant, VariantCopy> = {
  "cloud-beta": {
    body: "Free while the beta lasts. Pricing will be announced before the beta ends, and nothing is charged without your explicit confirmation. If you opt out, you can export everything and move to self-host.",
    description:
      "You are on an invited beta of Managed Cloud. Provider usage stays on your own keys, with no markup.",
    source: "settings_feedback",
    submitLabel: "Send feedback",
    success: "Thanks, your answer helps us set the price.",
  },
  "self-host": {
    body: "Hosting, backups and one bill for the whole team, fully managed. Unlimited keywords and projects. You still bring your own provider keys: we add no markup and take no cut of provider usage. We're still setting the price, so help us land it.",
    description:
      "Self-hosted is free forever and you pay your SERP provider directly. Managed Cloud billing is on the way.",
    source: "settings_notify",
    submitLabel: "Notify me",
    success: "You are on the list - we'll reach out shortly about early access.",
  },
};

const planLabelClass = "uppercase tracking-[0.5px]";
const planNameClass = "text-[17px] font-bold tracking-[-0.2px]";
const bodyClass = "max-w-[640px] text-[13px] leading-relaxed text-fg-muted";
const feedbackClass = "text-[11.5px] font-medium";

function VariantChip({
  active,
  icon,
  label,
  onClick,
}: Readonly<{ active: boolean; icon: ReactNode; label: string; onClick: () => void }>) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.5px] transition-colors",
        active
          ? "border-accent bg-accent-soft text-accent"
          : "border-border bg-bg-sunken text-fg-muted hover:border-accent hover:text-fg",
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function PlanChip({ children, tone }: Readonly<{ children: ReactNode; tone: "accent" | "green" }>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.5px]",
        tone === "green" ? "bg-green/10 text-green" : "bg-accent-soft text-accent",
      )}
    >
      {children}
    </span>
  );
}

export function UsageBillingSection({
  email,
  projectId,
  submitInterest,
  variant,
}: Readonly<UsageBillingSectionProps>) {
  const [isPending, startTransition] = useTransition();
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState<{ text: string; tone: "error" | "ok" } | null>(null);
  const [view, setView] = useState<UsageBillingVariant>(variant);
  const copy = copyByVariant[view];
  const selfHost = view === "self-host";
  // A self-host user browsing the cloud plan is previewing, not invited - keep the copy honest.
  const previewingCloud = view === "cloud-beta" && variant === "self-host";
  const focusDeepLinkTarget = useCallback((section: HTMLElement | null) => {
    if (!section || window.location.hash !== `#${USAGE_BILLING_TARGET.id}`) return;
    requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      section.focus({ preventScroll: true });
      section.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  }, []);

  function switchView(next: UsageBillingVariant) {
    setView(next);
    setMessage(null);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const payload = price
      ? {
          cloudPrice: "custom" as const,
          cloudPriceCustom: price,
          email,
          projectId,
          source: copy.source,
        }
      : { email, projectId, source: copy.source };
    startTransition(() => {
      void submitInterest(payload)
        .then(() => setMessage({ text: copy.success, tone: "ok" }))
        .catch((error: unknown) =>
          setMessage({
            text: actionErrorMessage(error, "Unable to send right now."),
            tone: "error",
          }),
        );
    });
  }

  return (
    <SettingsSection
      action={
        <div className="flex flex-wrap items-center gap-2">
          <VariantChip
            active={selfHost}
            icon={<HardDrives aria-hidden size={13} weight="bold" />}
            label="Self-host"
            onClick={() => switchView("self-host")}
          />
          <VariantChip
            active={!selfHost}
            icon={<Cloud aria-hidden size={13} weight="bold" />}
            label="Cloud beta"
            onClick={() => switchView("cloud-beta")}
          />
        </div>
      }
      contentClassName="space-y-4"
      description={
        previewingCloud
          ? "A preview of the invited Managed Cloud beta. Provider usage stays on your own keys, with no markup."
          : copy.description
      }
      id={USAGE_BILLING_TARGET.id}
      sectionRef={focusDeepLinkTarget}
      title="Usage & billing"
    >
      {selfHost ? (
        <>
          <div>
            <MonoText className={planLabelClass} muted>
              Plan
            </MonoText>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className={planNameClass}>Self-hosted</span>
              <PlanChip tone="green">Free</PlanChip>
            </div>
          </div>
          <div className="border-t border-border-soft pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold">Managed Cloud</span>
              <PlanChip tone="accent">Coming soon</PlanChip>
            </div>
            <p className={cn(bodyClass, "mt-2")}>{copy.body}</p>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <MonoText className={planLabelClass} muted>
                Plan
              </MonoText>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={planNameClass}>Managed Cloud</span>
                <PlanChip tone="accent">Free beta</PlanChip>
              </div>
            </div>
            {previewingCloud ? null : (
              <div>
                <MonoText className={planLabelClass} muted>
                  Invited by
                </MonoText>
                <div className={cn(planNameClass, "mt-1")}>bisibility team</div>
              </div>
            )}
          </div>
          <p className={cn(bodyClass, "border-t border-border-soft pt-4")}>{copy.body}</p>
        </>
      )}
      <form className="space-y-1.5" onSubmit={onSubmit}>
        <label
          className="block font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint"
          htmlFor="usage-billing-price"
        >
          What would you pay per month?
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <span className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-border-strong bg-bg-sunken px-3 transition-colors focus-within:border-accent sm:max-w-[220px]">
            <span className="font-mono text-[13px] text-fg-faint">$</span>
            <input
              className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-fg outline-none"
              id="usage-billing-price"
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => setPrice(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="20"
              value={price}
            />
          </span>
          <Button
            loading={isPending}
            loadingLabel="Sending"
            startIcon={
              selfHost ? (
                <Bell aria-hidden size={15} weight="bold" />
              ) : (
                <PaperPlaneTilt aria-hidden size={15} weight="bold" />
              )
            }
            type="submit"
            variant={selfHost ? "primary" : "secondary"}
          >
            {copy.submitLabel}
          </Button>
        </div>
        {message ? (
          <p className={cn(feedbackClass, message.tone === "ok" ? "text-fg-muted" : "text-red")}>
            {message.text}
          </p>
        ) : null}
      </form>
    </SettingsSection>
  );
}
