"use client";

import { AlertSeveritySelect } from "@/components/alerts/AlertSeveritySelect";
import { NewRuleDeliveryFields } from "@/components/alerts/NewRuleDeliveryFields";
import {
  ConditionFields,
  conditionOptions,
  ScopeFields,
  TemplatePicker,
} from "@/components/alerts/NewRuleDrawerControls";
import { NewRuleDrawerFooter } from "@/components/alerts/NewRuleDrawerFooter";
import {
  CurrentRulePreview,
  NewRuleMarketFields,
  RuleSaveStatus,
} from "@/components/alerts/NewRuleMarketFields";
import { localizedNewRuleFormDefaults } from "@/components/alerts/new-rule-form-defaults";
import { readRuleSaveOutcome } from "@/components/alerts/new-rule-save-outcome";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Sheet } from "@/components/ui/Sheet";
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
import { makePublicId } from "@/lib/db/public-id";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { ClockCountdownIcon as ClockCountdown } from "@phosphor-icons/react/dist/csr/ClockCountdown";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { RuleDrawerCloseConfirm } from "./RuleDrawerCloseConfirm";
import { RuleNameField } from "./RuleNameField";

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
const selectTriggerClass = "mb-3 normal-case tracking-normal";
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
  const t = useTranslations("projectAlerts.drawer");
  const router = useRouter();
  const [confirmClose, setConfirmClose] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const [persistedRule, setPersistedRule] = useState<NewRuleForm | null>(null);
  const availableMarketIds = targets.markets.map((market) => market.id);
  const form = useZodForm<NewRuleForm>(newRuleSchema, {
    defaultValues: localizedNewRuleFormDefaults(
      projectId,
      initialTemplate,
      t("templateName", { template: initialTemplate }),
      initialRule,
      availableMarketIds,
    ),
  });
  const {
    formState: { errors, isSubmitting, isDirty },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = form;
  const templates = ruleTemplatesForDomain(projectDomain);
  const selectedId = watch("template");
  const selectedSeverity = watch("severity");
  const isEdit = Boolean(initialRule || watch("ruleId"));
  const { readOnly } = useProjectWriteMode();
  const formRef = useRef<HTMLFormElement>(null);
  const requestId = useRef<string | null>(null);

  function handleClose() {
    setConfirmClose(false);
    setActionError(null);
    setActionWarning(null);
    setPersistedRule(null);
    requestId.current = null;
    reset(
      localizedNewRuleFormDefaults(
        projectId,
        initialTemplate,
        t("templateName", { template: initialTemplate }),
        initialRule,
        availableMarketIds,
      ),
    );
    onClose();
  }

  function selectTemplate(templateId: RuleTemplateId) {
    const next = templates[templateId];
    if (next.disabled) {
      return;
    }
    setValue("template", templateId, { shouldDirty: true });
    setValue("name", t("templateName", { template: templateId }), {
      shouldDirty: true,
      shouldValidate: true,
    });
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
      if (!values.ruleId && !requestId.current) requestId.current = makePublicId("alr");
      const result = await (values.ruleId
        ? actions.updateAlertRuleAction(values)
        : actions.createAlertRuleAction({
            ...values,
            requestId: requestId.current,
          }));
      const outcome = readRuleSaveOutcome(result, projectId, t("alreadyCreated"));
      if (outcome.kind === "error") {
        setActionError(outcome.message);
        return;
      }
      if (outcome.kind === "stay") {
        if (outcome.ruleId) setValue("ruleId", outcome.ruleId);
        setPersistedRule(outcome.persisted);
        setActionWarning(outcome.warning);
        router.refresh();
        return;
      }
      handleClose();
      router.refresh();
    } catch (error) {
      setPersistedRule(null);
      setActionError(values.ruleId ? actionErrorMessage(error, t("saveError")) : t("saveError"));
      router.refresh();
    }
  }

  function submitWithEnabled(enabled: boolean) {
    setValue("enabled", enabled);
    formRef.current?.requestSubmit();
  }

  return (
    <Sheet
      footer={
        <NewRuleDrawerFooter
          isEdit={isEdit}
          isSubmitting={isSubmitting}
          onSubmitWithEnabled={submitWithEnabled}
          readOnly={readOnly}
        />
      }
      onClose={() => {
        if (isDirty || isSubmitting) setConfirmClose(true);
        else handleClose();
      }}
      open={open}
      title={
        <span className="block">
          {isEdit ? t("editTitle") : t("newTitle")}
          <span className="mt-[3px] block text-[13px] font-normal tracking-normal text-fg-muted">
            {t("intro")}
          </span>
        </span>
      }
    >
      <form
        className="flex flex-col gap-5.5"
        onSubmit={handleSubmit(save, (invalid) =>
          setActionError(
            Object.values(invalid).find((issue) => issue?.message)?.message ?? t("reviewFields"),
          ),
        )}
        ref={formRef}
      >
        <input type="hidden" {...register("projectId")} />
        <input type="hidden" {...register("ruleId")} />
        <input type="hidden" {...register("severity")} />
        <input type="hidden" {...register("template")} />
        <TemplatePicker onSelect={selectTemplate} selectedId={selectedId} />
        <RuleNameField error={errors.name} register={register} />
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
          <div className="mb-2 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            {t("condition")}
          </div>
          <input type="hidden" {...register("conditionType")} />
          <MenuSelect
            size="input"
            ariaLabel={t("conditionAria")}
            onChange={(value) =>
              setValue("conditionType", value as NewRuleForm["conditionType"], {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            options={conditionOptions(t)}
            triggerClassName={selectTriggerClass}
            value={watch("conditionType")}
          />
          <ConditionFields
            conditionType={watch("conditionType")}
            errors={errors}
            register={register}
          />
          <div className="mt-[9px] flex items-center gap-[7px] font-sans tabular-nums text-[11.5px] text-fg-muted">
            <ClockCountdown weight="regular" aria-hidden size={13} />
            {t("evaluation", { mode: t("templateEvaluation", { template: selectedId }) })}
          </div>
        </section>
        <NewRuleDeliveryFields
          deleteWebhookEndpointAction={
            canManageEndpoints ? actions.deleteWebhookEndpointAction : undefined
          }
          projectId={projectId}
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
        <RuleSaveStatus
          actionError={actionError}
          actionWarning={actionWarning}
          persistedRule={persistedRule}
          projectDomain={projectDomain}
          savedHeading={t("savedRule")}
          targets={targets}
        />
        <CurrentRulePreview projectDomain={projectDomain} targets={targets} values={watch()} />
      </form>
      <RuleDrawerCloseConfirm
        open={confirmClose}
        pending={isSubmitting}
        onCancel={() => setConfirmClose(false)}
        onDiscard={handleClose}
      />
    </Sheet>
  );
}
