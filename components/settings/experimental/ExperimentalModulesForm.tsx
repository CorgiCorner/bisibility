"use client";

import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { Switch } from "@/components/ui/Switch";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  type ExperimentalModuleKey,
  type ExperimentalModulesInput,
  experimentalModuleKeys,
  experimentalModulesSchema,
  normalizeExperimentalModules,
} from "@/lib/settings/experimental-modules";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";

export type UpdateExperimentalModules = (
  input: ExperimentalModulesInput,
) => Promise<{ enabledExperimentalModules: ExperimentalModuleKey[] }>;

type ExperimentalModulesFormProps = {
  canEdit: boolean;
  enabledExperimentalModules: readonly ExperimentalModuleKey[];
  projectId: string;
  updateExperimentalModules: UpdateExperimentalModules;
};

export function ExperimentalModulesForm({
  canEdit,
  enabledExperimentalModules,
  projectId,
  updateExperimentalModules,
}: Readonly<ExperimentalModulesFormProps>) {
  const router = useRouter();
  const t = useTranslations("projectSettingsExperimental");
  const [saveError, setSaveError] = useState<string | null>(null);
  const changeRevision = useRef(0);
  const confirmedValues = useRef<ExperimentalModulesInput>({
    enabledExperimentalModules: [...enabledExperimentalModules],
    projectId,
  });
  const saveQueue = useRef(Promise.resolve());
  const form = useForm<ExperimentalModulesInput>({
    defaultValues: { enabledExperimentalModules: [...enabledExperimentalModules], projectId },
    mode: "onChange",
    resolver: zodResolver(experimentalModulesSchema),
  });

  function saveModules(values: ExperimentalModulesInput, revision: number) {
    if (!canEdit) return;

    const save = async () => {
      if (revision !== changeRevision.current) return;

      setSaveError(null);
      try {
        await form.handleSubmit(async () => {
          const updated = await updateExperimentalModules(values);
          const confirmed = {
            ...values,
            enabledExperimentalModules: updated.enabledExperimentalModules,
          };
          confirmedValues.current = confirmed;
          if (revision === changeRevision.current) {
            form.reset(confirmed);
            router.refresh();
          }
        })();
      } catch (error: unknown) {
        changeRevision.current += 1;
        form.reset(confirmedValues.current);
        setSaveError(actionErrorMessage(error, t("saveError")));
      }
    };

    saveQueue.current = saveQueue.current.then(save, save);
  }

  function toggleModule(key: ExperimentalModuleKey, checked: boolean) {
    if (!canEdit) return;

    const currentValues = form.getValues();
    const previousValues = {
      ...currentValues,
      enabledExperimentalModules: [...currentValues.enabledExperimentalModules],
    };
    const enabled = normalizeExperimentalModules([
      ...previousValues.enabledExperimentalModules.filter((item) => item !== key),
      ...(checked ? [key] : []),
    ]);
    form.setValue("enabledExperimentalModules", enabled);
    const values = { ...previousValues, enabledExperimentalModules: enabled };
    changeRevision.current += 1;
    saveModules(values, changeRevision.current);
  }

  const enabled = form.watch("enabledExperimentalModules");
  const moduleLabel = (key: ExperimentalModuleKey) => t(`module.${key}`);

  return (
    <SettingsCard description={t("description")} showSave={false} title={t("title")}>
      <form onSubmit={(event) => event.preventDefault()}>
        <fieldset className="contents" disabled={!canEdit}>
          <input type="hidden" {...form.register("projectId")} />
          <div className="flex flex-col gap-2">
            {experimentalModuleKeys.map((key) => (
              <Switch
                aria-label={moduleLabel(key)}
                checked={enabled.includes(key)}
                disabled={!canEdit}
                key={key}
                label={moduleLabel(key)}
                onChange={(event) => toggleModule(key, event.currentTarget.checked)}
              />
            ))}
          </div>
          {saveError ? <p className="m-0 mt-3 text-[12px] text-red-text">{saveError}</p> : null}
        </fieldset>
      </form>
    </SettingsCard>
  );
}
