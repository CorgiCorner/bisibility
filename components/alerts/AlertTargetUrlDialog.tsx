"use client";

import { TargetUrlField } from "@/components/keywords/TargetUrlField";
import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { setAlertKeywordTargetUrl } from "@/lib/actions/alert-feed";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { targetUrlValueSchema } from "@/lib/schemas/keyword";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({ targetUrl: targetUrlValueSchema });
type FormValues = z.infer<typeof formSchema>;

type AlertTargetUrlDialogProps = {
  alertId: string;
  keyword: string;
  onClose: () => void;
  projectId: string;
  targetUrl: string | null;
};

export function AlertTargetUrlDialog({
  alertId,
  keyword,
  onClose,
  projectId,
  targetUrl,
}: Readonly<AlertTargetUrlDialogProps>) {
  const t = useTranslations("projectAlerts.target");
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<FormValues>({
    defaultValues: { targetUrl: targetUrl ?? "" },
    resolver: zodResolver(formSchema),
  });

  async function save(values: FormValues) {
    setActionError(null);
    try {
      await setAlertKeywordTargetUrl({ alertId, projectId, targetUrl: values.targetUrl });
      onClose();
      router.refresh();
    } catch (error) {
      setActionError(actionErrorMessage(error, t("saveError")));
    }
  }

  return (
    <AppDrawer
      description={t("description", { keyword })}
      onClose={onClose}
      open
      title={t("title")}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => void save(values))}>
        <TargetUrlField
          error={errors.targetUrl?.message}
          help={t("fieldHelp")}
          label={t("fieldLabel")}
          placeholder="https://example.com/page"
          {...register("targetUrl")}
        />
        <Button disabled={isSubmitting} style={{ minHeight: 40 }} type="submit" variant="primary">
          {isSubmitting ? t("saving") : t("save")}
        </Button>
        {actionError ? (
          <span className="font-sans tabular-nums text-[11px] text-red-text">{actionError}</span>
        ) : null}
      </form>
    </AppDrawer>
  );
}
