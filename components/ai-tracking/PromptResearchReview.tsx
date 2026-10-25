"use client";
import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { trackPromptResearchAction } from "@/lib/actions/prompt-research";
import {
  normalizedResearchText,
  type ResearchedPrompt,
} from "@/lib/ai-research/prompt-research-projection";
import { researchTopicSchema } from "@/lib/ai-research/prompt-research-schema";
import type { TrackingWorkspaceData } from "@/lib/ai-tracking/projections/workspace";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

export function PromptResearchReview({
  projectId,
  keyword,
  reportId,
  prompts,
  topics,
  onClose,
  onSaved,
}: Readonly<{
  projectId: string;
  keyword: string;
  reportId: string;
  prompts: ResearchedPrompt[];
  topics: TrackingWorkspaceData["topics"];
  onClose: () => void;
  onSaved: (value: Awaited<ReturnType<typeof trackPromptResearchAction>>) => void;
}>) {
  const t = useTranslations("projectAiTracking.research");
  const errors = useSharedErrorMessages();
  const [failed, setFailed] = useState(false);
  const form = useForm({
    resolver: zodResolver(researchTopicSchema),
    defaultValues: {
      topic:
        topics.find(
          (topic) => normalizedResearchText(topic.name) === normalizedResearchText(keyword),
        )?.name ?? keyword,
    },
  });
  return (
    <AppDrawer
      open
      onClose={onClose}
      title={t("reviewTitle")}
      description={t("reviewHint")}
      sheetOnMobile
    >
      <form
        className="grid gap-4"
        onSubmit={form.handleSubmit(async (input) => {
          setFailed(false);
          try {
            onSaved(
              await trackPromptResearchAction(projectId, {
                ...input,
                reportId,
                rowIndices: prompts.map((prompt) => prompt.rowIndex),
              }),
            );
          } catch {
            setFailed(true);
          }
        })}
      >
        <ul className="m-0 grid gap-2 pl-5 text-ui-body">
          {prompts.map((prompt) => (
            <li key={prompt.rowIndex}>{prompt.text}</li>
          ))}
        </ul>
        {topics.length ? (
          <div className="grid gap-2 text-ui-body">
            <span>{t("existingTopic")}</span>
            <MenuSelect
              ariaLabel={t("existingTopic")}
              size="input"
              value={topics.find((topic) => topic.name === form.watch("topic"))?.id ?? ""}
              options={topics.map((topic) => ({ value: topic.id, label: topic.name }))}
              onChange={(id) =>
                form.setValue("topic", topics.find((topic) => topic.id === id)?.name ?? "")
              }
            />
          </div>
        ) : null}
        <label htmlFor="research-topic" className="grid gap-2 text-ui-body">
          {t("topic")}
          <Input
            id="research-topic"
            {...form.register("topic")}
            maxLength={200}
            aria-invalid={Boolean(form.formState.errors.topic)}
          />
        </label>
        {form.formState.errors.topic ? (
          <p role="alert" className="text-ui-body text-red-text">
            {t("topicRequired")}
          </p>
        ) : null}
        {failed ? (
          <p role="alert" className="text-ui-body text-red-text">
            {errors.genericFallback()}
          </p>
        ) : null}
        <Button
          type="submit"
          loading={form.formState.isSubmitting}
          disabled={form.formState.isSubmitting}
        >
          {t("confirmTracking", { count: String(prompts.length) })}
        </Button>
      </form>
    </AppDrawer>
  );
}
