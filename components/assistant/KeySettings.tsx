"use client";

import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { AssistantRequestError, assistantFetch } from "@/lib/assistant/client/api";
import { PROVIDER_LABELS } from "@/lib/assistant/client/provider-label";
import {
  ASSISTANT_API,
  type AssistantErrorCode,
  type AssistantProvider,
  byokCredentialRequestSchema,
  type FundingOptionView,
} from "@/lib/assistant/wire";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

type Fields = z.infer<typeof byokCredentialRequestSchema>;
export function KeySettings({
  options,
  provider,
  refresh,
}: Readonly<{
  options: FundingOptionView[];
  provider: AssistantProvider;
  refresh: () => Promise<unknown>;
}>) {
  const t = useTranslations("assistant");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [error, setError] = useState<AssistantErrorCode | "network" | null>(null);
  const form = useForm<Fields>({
    resolver: zodResolver(byokCredentialRequestSchema),
    defaultValues: { provider, apiKey: "" },
  });
  async function save(fields: Fields) {
    setError(null);
    try {
      await assistantFetch(ASSISTANT_API.credentials, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      form.reset({ provider: fields.provider, apiKey: "" });
      await refresh();
    } catch (failure) {
      form.setValue("apiKey", "");
      setError(
        failure instanceof AssistantRequestError ? (failure.detail?.code ?? "network") : "network",
      );
    }
  }
  return (
    <section className="space-y-2">
      {options
        .filter(
          (
            option,
          ): option is FundingOptionView & {
            credential: NonNullable<FundingOptionView["credential"]>;
          } => option.mode === "byok" && option.provider === provider && option.credential !== null,
        )
        .map((option) => (
          <div className="flex items-center justify-between gap-2 text-xs" key={option.provider}>
            <span>
              {PROVIDER_LABELS[option.provider]}:{" "}
              {t("keyLast4", {
                last4: option.credential.last4,
                status: t(
                  option.credential.status === "active" ? "credentialActive" : "credentialInvalid",
                ),
              })}
            </span>
            <Button onClick={() => setRemoveId(option.credential.id)} type="button" variant="ghost">
              {t("removeKey")}
            </Button>
          </div>
        ))}
      <form className="space-y-2" onSubmit={form.handleSubmit(save)}>
        <FieldLabel
          className="flex text-xs text-fg-muted"
          htmlFor={`assistant-api-key-${provider}`}
          label={t("keyInput")}
        />
        <Input
          autoComplete="off"
          id={`assistant-api-key-${provider}`}
          type="password"
          {...form.register("apiKey")}
        />
        {form.formState.errors.apiKey ? <p role="alert">{t("keyInvalid")}</p> : null}
        {error ? (
          <p role="alert">{error === "network" ? t("networkError") : t(`errors.${error}`)}</p>
        ) : null}
        <Button disabled={form.formState.isSubmitting} size="input" type="submit">
          {t("saveKey")}
        </Button>
      </form>
      <ConfirmModal
        kind="removeProviderKey"
        onClose={() => setRemoveId(null)}
        onConfirm={async () => {
          if (!removeId) return;
          await assistantFetch(ASSISTANT_API.credential(removeId), { method: "DELETE" });
          setRemoveId(null);
          await refresh();
        }}
        open={Boolean(removeId)}
        showConfirmationToast={false}
      />
    </section>
  );
}
