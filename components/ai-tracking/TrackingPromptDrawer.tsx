"use client";
import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Textarea } from "@/components/ui/Textarea";
import { trackingPromptForm } from "@/lib/ai-tracking/projections/forms";
import type {
  TrackingPromptDraft,
  TrackingPromptRow,
  TrackingWorkspaceData,
} from "@/lib/ai-tracking/projections/workspace";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

export function TrackingPromptDrawer({
  open,
  prompt,
  draft,
  topics,
  onClose,
  onSave,
  pending,
  error,
}: Readonly<{
  open: boolean;
  prompt?: TrackingPromptRow;
  draft?: TrackingPromptDraft;
  topics: TrackingWorkspaceData["topics"];
  onClose: () => void;
  onSave: (data: z.infer<typeof trackingPromptForm>) => Promise<void>;
  pending: boolean;
  error?: string | null;
}>) {
  const t = useTranslations("projectAiTracking");
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof trackingPromptForm>, unknown, z.output<typeof trackingPromptForm>>({
    resolver: zodResolver(trackingPromptForm),
    defaultValues: {
      text: prompt?.text ?? draft?.text ?? "",
      label: prompt?.label ?? "",
      category: draft?.category ?? prompt?.category ?? "neutral",
      topicId: prompt?.topicId ?? null,
      generationReference: draft?.generationReference,
      providerDatasetReference: draft?.providerDatasetReference,
    },
  });
  return (
    <AppDrawer
      open={open}
      onClose={onClose}
      title={prompt ? t("editPrompt") : t("addPrompt")}
      description={t("everyTextEditCreatesANewImmutableRevision")}
      sheetOnMobile
    >
      <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSave)}>
        {error && (
          <p role="alert" className="text-sm text-red-text">
            {error}
          </p>
        )}
        <label htmlFor="tracking-text" className="flex flex-col gap-2 text-sm font-medium">
          {t("promptText")}
          <Textarea
            id="tracking-text"
            {...register("text")}
            rows={6}
            aria-invalid={Boolean(errors.text)}
            placeholder={t("whichToolsHelpASmallTeamTrackSearch")}
          />
          {errors.text && (
            <span role="alert" className="text-red-text">
              {errors.text.message}
            </span>
          )}
        </label>
        <label htmlFor="tracking-label" className="flex flex-col gap-2 text-sm font-medium">
          {t("label")}
          <Input id="tracking-label" {...register("label")} placeholder={t("optionalLabel")} />
        </label>
        <div className="flex flex-col gap-2 text-sm font-medium">
          {t("promptCategory")}
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <MenuSelect
                ariaLabel={t("promptCategory")}
                size="input"
                value={field.value ?? "neutral"}
                onChange={field.onChange}
                options={[
                  { value: "neutral", label: t("neutral") },
                  { value: "comparative", label: t("comparative") },
                  { value: "branded", label: t("branded") },
                ]}
              />
            )}
          />
        </div>
        <div className="flex flex-col gap-2 text-sm font-medium">
          {t("topic")}
          <Controller
            control={control}
            name="topicId"
            render={({ field }) => (
              <MenuSelect
                ariaLabel={t("topic")}
                size="input"
                value={field.value ?? ""}
                onChange={(value) => field.onChange(value || null)}
                options={[
                  { value: "", label: t("unassigned") },
                  ...topics
                    .filter((topic) => topic.status === "active")
                    .map((topic) => ({ value: topic.id, label: topic.name })),
                ]}
              />
            )}
          />
        </div>
        <p className="rounded-card border border-border bg-bg-sunken p-3 text-xs leading-5 text-fg-muted">
          {t("savingAPromptDoesNotRunItOr")}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" loading={pending || isSubmitting}>
            {prompt ? t("saveRevision") : t("addPrompt")}
          </Button>
        </div>
      </form>
    </AppDrawer>
  );
}
