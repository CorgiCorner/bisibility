"use client";

import { consentCopy } from "@/components/analytics/consent-copy";
import { Button } from "@/components/ui/Button";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { saveAnalyticsConsent } from "@/lib/actions/analytics-consent";
import { applyAnalyticsConsent, setAnalyticsReplay } from "@/lib/analytics/client";
import {
  type AnalyticsConsentValues,
  analyticsConsentValuesSchema,
  type ConsentState,
} from "@/lib/analytics/consent";
import { restrictConsentImmediately } from "@/lib/analytics/consent-client";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";

export type SaveConsent = (values: AnalyticsConsentValues) => Promise<ConsentState>;

type ConsentSettingsModalProps = {
  initialConsent: ConsentState;
  onClose: () => void;
  onSaved?: (consent: ConsentState) => void;
  open: boolean;
  saveConsent?: SaveConsent;
};

export function ConsentSettingsModal({
  initialConsent,
  onClose,
  onSaved,
  open,
  saveConsent = saveAnalyticsConsent,
}: Readonly<ConsentSettingsModalProps>) {
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const form = useForm<AnalyticsConsentValues>({
    defaultValues: {
      analytics: initialConsent.analytics,
      replay: initialConsent.replay,
    },
    resolver: zodResolver(analyticsConsentValuesSchema),
  });
  const analytics = form.watch("analytics");
  const submitting = saving || form.formState.isSubmitting;
  const analyticsField = form.register("analytics");

  async function persist(values: AnalyticsConsentValues) {
    restrictConsentImmediately(values);
    setActionError(null);
    setSaving(true);
    try {
      const saved = await saveConsent(values);
      applyAnalyticsConsent(saved);
      setAnalyticsReplay(saved.replay);
      onSaved?.(saved);
      onClose();
    } catch {
      setActionError(
        "Your changes could not be saved. Choices you turned off remain off. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const submit: SubmitHandler<AnalyticsConsentValues> = persist;

  return (
    <Modal
      dismissDisabled={submitting}
      footer={
        <>
          <Button
            className="whitespace-nowrap"
            disabled={submitting}
            onClick={() => void persist({ analytics: false, replay: false })}
            size="sm"
            type="button"
            variant="secondary"
          >
            Reject all
          </Button>
          <Button
            className="whitespace-nowrap"
            disabled={submitting}
            onClick={() => void persist({ analytics: true, replay: true })}
            size="sm"
            type="button"
            variant="secondary"
          >
            Accept all
          </Button>
          <Button
            className="whitespace-nowrap"
            disabled={submitting}
            form="privacy-choices-form"
            loading={form.formState.isSubmitting}
            size="sm"
            style={{ marginLeft: "auto" }}
            type="submit"
          >
            Save
          </Button>
        </>
      }
      footerClassName="gap-2"
      headerDivider
      onClose={onClose}
      open={open}
      title={consentCopy.modal.title}
    >
      <form id="privacy-choices-form" noValidate onSubmit={form.handleSubmit(submit)}>
        <p className="m-0 text-[13px] leading-5.5 text-fg-muted">{consentCopy.modal.intro}</p>
        <div className="mt-4 divide-y divide-border overflow-hidden rounded-control border border-border">
          <div className="flex items-start justify-between gap-4 bg-bg-sunken p-3.5">
            <div className="min-w-0">
              <p className="m-0 text-[13px] font-semibold text-fg">
                {consentCopy.modal.essential.title}
              </p>
              <p className="m-0 mt-1 text-[12px] leading-5 text-fg-muted">
                {consentCopy.modal.essential.body}
              </p>
            </div>
            <span className="shrink-0 text-[11px] leading-5 text-fg-muted">Always on</span>
          </div>
          <div>
            <Switch
              {...analyticsField}
              checked={analytics}
              className="w-full flex-row-reverse justify-between gap-4 rounded-none border-0 bg-transparent p-3.5"
              description={<span className="font-normal">{consentCopy.modal.usage.body}</span>}
              disabled={submitting}
              label={consentCopy.modal.usage.title}
              labelClassName="flex-1 text-fg"
              onChange={(event) => {
                void analyticsField.onChange(event);
              }}
            />
          </div>
          <div>
            <Switch
              {...form.register("replay")}
              checked={form.watch("replay")}
              className="w-full flex-row-reverse justify-between gap-4 rounded-none border-0 bg-transparent p-3.5"
              description={<span className="font-normal">{consentCopy.modal.replay.body}</span>}
              disabled={submitting}
              label={consentCopy.modal.replay.title}
              labelClassName="flex-1 text-fg"
            />
          </div>
        </div>
        <p className="m-0 mt-4 text-[12px] leading-5 text-fg-muted">
          {consentCopy.modal.visitCounts}
        </p>
        <p className="m-0 mt-3 text-[12px] leading-5 text-fg-muted">
          {consentCopy.modal.footer}{" "}
          <ExternalLink className="font-semibold text-accent hover:underline" href="/privacy">
            Privacy policy
          </ExternalLink>
        </p>
        {actionError ? (
          <p className="m-0 mt-3 text-[12px] text-red-text" role="alert">
            {actionError}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
