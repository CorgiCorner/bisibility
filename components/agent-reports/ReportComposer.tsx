"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/toast-context";
import { type ManualReportInput, manualReportSchema } from "@/lib/agent-reports/manual-model";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";

export function ReportComposer({
  projectId,
  saveAction,
}: Readonly<{
  projectId: string;
  saveAction: (input: unknown) => Promise<{ id: string }>;
}>) {
  const t = useTranslations("agentWorkspace");
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const formId = useId();
  const form = useForm<ManualReportInput>({
    defaultValues: { title: "", analysis: "" },
    resolver: zodResolver(manualReportSchema),
  });
  async function save(values: ManualReportInput) {
    setFailed(false);
    try {
      const report = await saveAction({ ...values, projectId });
      showToast(t("reportSaved"), { severity: "success" });
      router.push(appPath(asProjectRef(projectId), "agent-reports", report.id));
    } catch {
      setFailed(true);
    }
  }
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        startIcon={<PlusIcon aria-hidden size={15} weight="regular" />}
      >
        {t("addReport")}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!form.formState.isSubmitting) setOpen(false);
        }}
        dismissDisabled={form.formState.isSubmitting}
        title={t("addReport")}
        size="lg"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              disabled={form.formState.isSubmitting}
              onClick={() => setOpen(false)}
              variant="secondary"
            >
              {t("cancel")}
            </Button>
            <Button form={formId} loading={form.formState.isSubmitting} type="submit">
              {t("saveReport")}
            </Button>
          </div>
        }
      >
        <form id={formId} className="grid gap-4" onSubmit={form.handleSubmit(save)}>
          <div className="grid gap-2">
            <label className="text-[13px] font-semibold" htmlFor="report-title">
              {t("title")}
            </label>
            <Input
              {...form.register("title")}
              id="report-title"
              maxLength={160}
              aria-invalid={Boolean(form.formState.errors.title)}
              disabled={form.formState.isSubmitting}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-[13px] font-semibold" htmlFor="report-analysis">
              {t("analysis")}
            </label>
            <Textarea
              {...form.register("analysis")}
              id="report-analysis"
              maxLength={12000}
              invalid={Boolean(form.formState.errors.analysis)}
              disabled={form.formState.isSubmitting}
            />
          </div>
          {Object.keys(form.formState.errors).length > 0 ? (
            <p className="text-[12px] text-red-text" role="alert">
              {t("reportValidation")}
            </p>
          ) : null}
          {failed ? (
            <p className="text-[13px] text-red-text" role="alert">
              {t("failed")}
            </p>
          ) : null}
        </form>
      </Modal>
    </>
  );
}
