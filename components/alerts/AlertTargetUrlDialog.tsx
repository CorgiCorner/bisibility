"use client";

import { TargetUrlField } from "@/components/keywords/TargetUrlField";
import { AppDrawer } from "@/components/ui";
import { setAlertKeywordTargetUrl } from "@/lib/actions/alert-feed";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { targetUrlValueSchema } from "@/lib/schemas/keyword";
import { actionErrorMessage } from "@/lib/ui/action-error";
import Button from "@mui/material/Button";
import { useRouter } from "next/navigation";
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
      setActionError(actionErrorMessage(error, "Target URL could not be saved."));
    }
  }

  return (
    <AppDrawer
      description={`Set the URL you expect to rank for "${keyword}".`}
      onClose={onClose}
      open
      title="Set target URL"
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => void save(values))}>
        <TargetUrlField
          error={errors.targetUrl?.message}
          placeholder="https://example.com/page"
          {...register("targetUrl")}
        />
        <Button disabled={isSubmitting} sx={{ minHeight: 40 }} type="submit" variant="contained">
          {isSubmitting ? "Saving..." : "Save target URL"}
        </Button>
        {actionError ? (
          <span className="font-mono text-[11px] text-red-text">{actionError}</span>
        ) : null}
      </form>
    </AppDrawer>
  );
}
