"use client";

import { AlertSeveritySelect } from "@/components/alerts/AlertSeveritySelect";
import { NewRuleDeliveryFields } from "@/components/alerts/NewRuleDeliveryFields";
import {
  ConditionFields,
  conditionOptions,
  ScopeFields,
  TemplatePicker,
} from "@/components/alerts/NewRuleDrawerControls";
import { NewRuleMarketFields, RulePreview } from "@/components/alerts/NewRuleMarketFields";
import { newRuleFormDefaults } from "@/components/alerts/new-rule-form-defaults";
import {
  ProjectReadOnlyTooltip,
  useProjectWriteMode,
} from "@/components/shell/ProjectWriteModeProvider";
import { Button, inputClassName, MenuSelect, Sheet } from "@/components/ui";
import type {
  AlertActionHandlers,
  AlertRuleView,
  AlertTargetOptions,
} from "@/lib/alerts/alert-data";
import {
  type NewRuleForm,
  newRuleSchema,
  type RuleTemplateId,
  ruleTemplatesForDomain,
} from "@/lib/alerts/new-rule-data";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { actionErrorMessage } from "@/lib/ui/action-error";
import {
  BellRingingIcon as BellRinging,
  ClockCountdownIcon as ClockCountdown,
  WarningCircleIcon as WarningCircle,
  XIcon as X,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";

type NewRuleDrawerProps = {
  actions: Pick<
    AlertActionHandlers,
    | "createAlertRuleAction"
    | "deleteWebhookEndpointAction"
    | "testWebhookEndpointAction"
    | "updateAlertRuleAction"
    | "upsertWebhookEndpointAction"
  >;
  canManageEndpoints: boolean;
  initialRule?: AlertRuleView;
  initialTemplate?: RuleTemplateId;
  onClose: () => void;
  open: boolean;
  projectDomain?: string | null;
  projectId: string;
  targets: AlertTargetOptions;
};

const labelClass =
  "flex flex-col gap-[7px] font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted";
const fieldClass = `${inputClassName} rounded-[9px] px-3 py-2.5 text-[13px] font-medium`;
const selectTriggerClass =
  "mb-3 min-h-10 w-full justify-between rounded-[9px] border-border-strong bg-transparent px-3 text-[13px] font-medium";

export function NewRuleDrawer({
  actions,
  canManageEndpoints,
  initialRule,
  initialTemplate = "slipped",
  onClose,
  open,
  projectDomain,
  projectId,
  targets,
}: Readonly<NewRuleDrawerProps>) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const availableMarketIds = targets.markets.map((market) => market.id);
  const form = useForm<NewRuleForm>({
    defaultValues: newRuleFormDefaults(projectId, initialTemplate, initialRule, availableMarketIds),
    resolver: zodResolver(newRuleSchema),
  });
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = form;
  const templates = ruleTemplatesForDomain(projectDomain);
  const selectedId = watch("template");
  const selected = templates[selectedId];
  const selectedSeverity = watch("severity");
  const isEdit = Boolean(initialRule || watch("ruleId"));
  const { readOnly } = useProjectWriteMode();
  const formRef = useRef<HTMLFormElement>(null);

  function handleClose() {
    setActionError(null);
    setActionWarning(null);
    reset(newRuleFormDefaults(projectId, initialTemplate, initialRule, availableMarketIds));
    onClose();
  }

  function selectTemplate(templateId: RuleTemplateId) {
    const next = templates[templateId];
    if (next.disabled) {
      return;
    }
    setValue("template", templateId, { shouldDirty: true });
    setValue("name", next.name, { shouldDirty: true, shouldValidate: true });
    setValue("severity", next.severity, { shouldDirty: true, shouldValidate: true });
    for (const [key, value] of Object.entries(next.defaults)) {
      setValue(key as keyof NewRuleForm, value, { shouldDirty: true, shouldValidate: true });
    }
  }

  async function save(values: NewRuleForm) {
    if (readOnly) {
      return;
    }
    setActionError(null);
    setActionWarning(null);
    try {
      const result = await (values.ruleId
        ? actions.updateAlertRuleAction(values)
        : actions.createAlertRuleAction(values));
      const saved = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
      if (saved.ok === false && typeof saved.error === "string") {
        setActionError(saved.error);
        return;
      }
      const warning = typeof saved.warning === "string" ? saved.warning : null;
      if (warning) {
        if (typeof saved.id === "string") {
          setValue("ruleId", saved.id);
        }
        setActionWarning(warning);
        router.refresh();
        return;
      }
      handleClose();
      router.refresh();
    } catch (error) {
      setActionError(actionErrorMessage(error, "Alert rule could not be saved."));
    }
  }

  function submitWithEnabled(enabled: boolean) {
    setValue("enabled", enabled);
    formRef.current?.requestSubmit();
  }

  return (
    <Sheet
      footer={
        <div className="flex items-center gap-2.5">
          <ProjectReadOnlyTooltip>
            <Button
              className="shrink-0"
              disabled={readOnly || isSubmitting}
              onClick={() => submitWithEnabled(false)}
              size="md"
              type="button"
              variant="secondary"
            >
              {isEdit ? "Save paused" : "Create paused"}
            </Button>
          </ProjectReadOnlyTooltip>
          <ProjectReadOnlyTooltip className="inline-flex flex-1">
            <Button
              className="flex-1"
              disabled={readOnly || isSubmitting}
              onClick={() => submitWithEnabled(true)}
              size="md"
              startIcon={<BellRinging aria-hidden size={14} weight="bold" />}
              type="button"
            >
              {isEdit ? "Save rule" : "Create rule"}
            </Button>
          </ProjectReadOnlyTooltip>
        </div>
      }
      onClose={handleClose}
      open={open}
      title={
        <span className="block">
          {isEdit ? "Edit alert rule" : "New alert rule"}
          <span className="mt-[3px] block text-[13px] font-normal tracking-normal text-fg-muted">
            Rules are evaluated after each completed rank check.
          </span>
        </span>
      }
    >
      <form
        className="flex flex-col gap-[22px]"
        onSubmit={handleSubmit(save, (invalid) =>
          setActionError(
            Object.values(invalid).find((issue) => issue?.message)?.message ??
              "Review the highlighted fields.",
          ),
        )}
        ref={formRef}
      >
        <input type="hidden" {...register("projectId")} />
        <input type="hidden" {...register("ruleId")} />
        <input type="hidden" {...register("severity")} />
        <input type="hidden" {...register("template")} />
        <TemplatePicker onSelect={selectTemplate} selectedId={selectedId} />
        <label className={labelClass}>
          {"Rule name "}
          <input className={fieldClass} {...register("name")} />
          {errors.name ? <span className="text-red-text">{errors.name.message}</span> : null}
        </label>
        <AlertSeveritySelect
          onChange={(value) =>
            setValue("severity", value, { shouldDirty: true, shouldValidate: true })
          }
          value={selectedSeverity}
        />
        <ScopeFields
          errors={errors}
          register={register}
          setValue={setValue}
          targetId={watch("targetIds")?.[0] ?? ""}
          targets={targets}
          targetType={watch("targetType")}
        />
        <NewRuleMarketFields
          marketIds={watch("marketIds")}
          markets={targets.markets}
          setValue={setValue}
        />
        <section>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            Condition
          </div>
          <input type="hidden" {...register("conditionType")} />
          <MenuSelect
            ariaLabel="Condition"
            onChange={(value) =>
              setValue("conditionType", value as NewRuleForm["conditionType"], {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            options={conditionOptions}
            triggerClassName={selectTriggerClass}
            value={watch("conditionType")}
          />
          <ConditionFields
            conditionType={watch("conditionType")}
            errors={errors}
            register={register}
          />
          <div className="mt-[9px] flex items-center gap-[7px] font-mono text-[11.5px] text-fg-muted">
            <ClockCountdown aria-hidden size={13} />
            Evaluation: {selected.evalMode}
          </div>
        </section>
        <NewRuleDeliveryFields
          deleteWebhookEndpointAction={
            canManageEndpoints ? actions.deleteWebhookEndpointAction : undefined
          }
          projectId={projectId}
          register={register}
          setValue={setValue}
          targets={targets}
          testWebhookEndpointAction={
            canManageEndpoints ? actions.testWebhookEndpointAction : undefined
          }
          upsertWebhookEndpointAction={
            canManageEndpoints ? actions.upsertWebhookEndpointAction : undefined
          }
          watch={watch}
        />
        {actionError ? (
          <p
            className="m-0 flex items-center gap-1.5 font-mono text-[11.5px] text-red-text"
            role="alert"
          >
            <X aria-hidden size={12} weight="bold" />
            {actionError}
          </p>
        ) : null}
        {actionWarning ? (
          <p className="m-0 flex items-start gap-1.5 font-mono text-[11.5px] text-yellow-text">
            <WarningCircle aria-hidden className="mt-0.5 shrink-0" size={12} weight="bold" />
            {actionWarning}
          </p>
        ) : null}
        <RulePreview>{selected.preview}</RulePreview>
      </form>
    </Sheet>
  );
}
