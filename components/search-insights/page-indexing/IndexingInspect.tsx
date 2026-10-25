"use client";

import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { InlineCallout } from "@/components/ui/InlineCallout";
import { Textarea } from "@/components/ui/Textarea";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { searchIndexInspectionSchema } from "@/lib/search-index/schema";
import type { InspectAction, InspectionFeedback } from "@/lib/search-index/ui-model";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

export function IndexingInspect({
  projectId,
  inspectAction,
  onClose,
  onStoredResult,
  onSubmitted,
  onExited,
}: Readonly<{
  projectId: string;
  inspectAction: InspectAction;
  onClose: () => void;
  onStoredResult: (url: string) => void;
  onSubmitted: () => void;
  onExited: () => void;
}>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const router = useRouter();
  const [feedback, setFeedback] = useState<InspectionFeedback[]>([]);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ urls: string[] }>({
    defaultValues: { urls: [] },
    resolver: zodResolver(searchIndexInspectionSchema),
  });
  return (
    <AppDrawer
      open
      onClose={onClose}
      onExited={onExited}
      sheetOnMobile
      autoFocusClose
      title={t("inspect")}
      description={t("inspectDescription")}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={handleSubmit(async ({ urls }) => {
          try {
            setFeedback(await inspectAction({ projectId, urls }));
            onSubmitted();
            router.refresh();
          } catch {
            setFeedback(urls.map((url) => ({ url, status: "failure" })));
          }
        })}
      >
        <label htmlFor="indexing-inspect-urls">{t("urls")}</label>
        <Textarea
          id="indexing-inspect-urls"
          rows={5}
          aria-invalid={Boolean(errors.urls)}
          aria-describedby={
            errors.urls ? "indexing-inspect-help indexing-inspect-error" : "indexing-inspect-help"
          }
          {...register("urls", {
            setValueAs: (value: string | string[]) =>
              Array.isArray(value)
                ? value
                : value
                    .split(/\r?\n/u)
                    .map((url) => url.trim())
                    .filter(Boolean),
          })}
        />
        <p id="indexing-inspect-help" className="m-0 text-ui-caption text-fg-muted">
          {t("inspectHelp")}
        </p>
        {errors.urls ? (
          <InlineCallout role="alert" tint="yellow">
            <span id="indexing-inspect-error">{t("invalidBatch")}</span>
          </InlineCallout>
        ) : null}
        <Button type="submit" size="sm" loading={isSubmitting}>
          {t("inspect")}
        </Button>
        {feedback.map((item, index) => (
          <InlineCallout
            key={`${index}:${item.url}`}
            role="status"
            tint={item.status === "success" ? "neutral" : "yellow"}
          >
            <span className="break-all">{item.url}</span> {t(`feedback.${item.status}`)}
            {item.status === "success" ? (
              <Button size="xs" variant="ghost" onClick={() => onStoredResult(item.url)}>
                {t("viewStored")}
              </Button>
            ) : null}
          </InlineCallout>
        ))}
      </form>
    </AppDrawer>
  );
}
