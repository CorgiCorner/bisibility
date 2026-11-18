"use client";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Modal } from "@/components/ui/Modal";
import { trackModelPlaygroundAction } from "@/lib/actions/model-playground-track";
import type { PlaygroundTopic } from "@/lib/ai-research/model-playground-view";
import { aiVisibilityTabHref } from "@/lib/ai-tracking/ai-visibility-paths";
import { modelProviderName } from "@/lib/model-playground/composer-state";
import { trackRequestSchema } from "@/lib/model-playground/track-request";
import type { ModelPlaygroundInput } from "@/lib/model-playground/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

export function ModelPlaygroundTrackDialog({
  open,
  onClose,
  projectId,
  runId,
  input,
  topics,
  save = trackModelPlaygroundAction,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  projectId: string;
  runId: string;
  input: ModelPlaygroundInput;
  topics: readonly PlaygroundTopic[];
  save?: typeof trackModelPlaygroundAction;
}>) {
  const t = useTranslations("projectAiResearch.modelPlayground");
  const fence = useRef(false);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof trackRequestSchema>>({
    resolver: zodResolver(trackRequestSchema),
    defaultValues: { projectRef: projectId, runId, topicId: null },
  });
  const submit = form.handleSubmit(async (value) => {
    if (fence.current || saved) return;
    fence.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await save(value);
      if (result.ok) setSaved(result.promptId);
      else
        setError(
          result.reason === "invalid_topic"
            ? t("presetInvalidTopic")
            : result.reason === "forbidden"
              ? t("presetForbidden")
              : result.reason === "conflict"
                ? t("presetConflict")
                : result.reason === "capacity"
                  ? t("presetCapacity")
                  : t("presetError"),
        );
    } catch {
      setError(t("presetError"));
    } finally {
      fence.current = false;
      setPending(false);
    }
  });
  return (
    <Modal open={open} onClose={onClose} title={t("trackPrompt")} dismissDisabled={pending}>
      <form className="grid min-w-0 gap-3" onSubmit={submit} data-model-track-dialog>
        <p className="m-0 whitespace-pre-wrap break-words text-ui-body">{input.prompt}</p>
        <p className="m-0 text-ui-body text-fg-muted">{t("presetDescription")}</p>
        <ul className="m-0 grid min-w-0 gap-2 pl-5 text-ui-body">
          {input.columns.map((column) => (
            <li className="break-words" key={column.columnId}>
              {modelProviderName(column.providerId)} / {column.modelId}
              <span className="block text-ui-caption text-fg-muted">
                {t("presetFutureSupport")}
              </span>
            </li>
          ))}
        </ul>
        {saved ? (
          <>
            <p className="m-0 text-ui-body" role="status">
              {t("presetSaved")}
            </p>
            <Button
              href={`${aiVisibilityTabHref(projectId, "prompts")}&prompt=${encodeURIComponent(saved)}`}
              size="input"
              className="justify-self-start"
              variant="outline"
            >
              {t("presetOpen")}
            </Button>
          </>
        ) : (
          <>
            <Controller
              control={form.control}
              name="topicId"
              render={({ field }) => (
                <FormField label={t("trackTopic")}>
                  <MenuSelect
                    triggerClassName="w-auto justify-self-start"
                    ariaLabel={t("trackTopic")}
                    size="input"
                    value={field.value ?? ""}
                    onChange={(value) => field.onChange(value || null)}
                    disabled={pending}
                    options={[
                      { label: t("trackUnassigned"), value: "" },
                      ...topics.map((topic) => ({ label: topic.name, value: topic.id })),
                    ]}
                  />
                </FormField>
              )}
            />
            {error ? (
              <p className="m-0 text-ui-body text-red-text" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="input" className="justify-self-start" loading={pending}>
              {t("presetSave")}
            </Button>
          </>
        )}
      </form>
    </Modal>
  );
}
