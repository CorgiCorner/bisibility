"use client";

import { AppDrawer } from "@/components/ui/AppDrawer";
import { Button } from "@/components/ui/Button";
import { InlineCallout } from "@/components/ui/InlineCallout";
import { Textarea } from "@/components/ui/Textarea";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { searchIndexInspectionSchema } from "@/lib/search-index/schema";
import type {
  InspectAction,
  InspectionFeedback,
  LoadUrlsAction,
  StoredSitemap,
} from "@/lib/search-index/ui-model";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { IndexingInspectSource } from "./IndexingInspectSource";

const formSchema = z
  .object({ urls: z.string() })
  .transform(({ urls }) => ({
    urls: urls
      .split(/\r?\n/u)
      .map((url) => url.trim())
      .filter(Boolean),
  }))
  .pipe(searchIndexInspectionSchema);

export function IndexingInspect({
  projectId,
  sitemaps,
  loadUrlsAction,
  inspectAction,
  onClose,
  onStoredResult,
  onSubmitted,
  onExited,
}: Readonly<{
  projectId: string;
  sitemaps: StoredSitemap[];
  loadUrlsAction: LoadUrlsAction;
  inspectAction: InspectAction;
  onClose: () => void;
  onStoredResult: (url: string) => void;
  onSubmitted: () => void;
  onExited: () => void;
}>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const router = useRouter();
  const [loadingUrls, setLoadingUrls] = useState(false);
  const [feedback, setFeedback] = useState<InspectionFeedback[]>([]);
  const {
    register,
    setValue,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof formSchema>, unknown, z.output<typeof formSchema>>({
    defaultValues: { urls: "" },
    resolver: zodResolver(formSchema),
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
        <IndexingInspectSource
          projectId={projectId}
          sitemaps={sitemaps}
          loadUrlsAction={loadUrlsAction}
          disabled={isSubmitting}
          onLoading={setLoadingUrls}
          onUrls={(urls) => {
            setValue("urls", urls.join("\n"));
            setFeedback([]);
          }}
        />
        <label htmlFor="indexing-inspect-urls">{t("urls")}</label>
        <Textarea
          id="indexing-inspect-urls"
          rows={5}
          aria-invalid={Boolean(errors.urls)}
          aria-describedby={
            errors.urls ? "indexing-inspect-help indexing-inspect-error" : "indexing-inspect-help"
          }
          disabled={isSubmitting || loadingUrls}
          {...register("urls")}
        />
        <p id="indexing-inspect-help" className="m-0 text-ui-caption text-fg-muted">
          {t("inspectHelp")}
        </p>
        {errors.urls ? (
          <InlineCallout role="alert" tint="yellow">
            <span id="indexing-inspect-error">{t("invalidBatch")}</span>
          </InlineCallout>
        ) : null}
        <Button
          className="self-start"
          type="submit"
          size="input"
          loading={isSubmitting}
          disabled={loadingUrls || !watch("urls").trim()}
        >
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
              <Button size="input" variant="ghost" onClick={() => onStoredResult(item.url)}>
                {t("viewStored")}
              </Button>
            ) : null}
          </InlineCallout>
        ))}
      </form>
    </AppDrawer>
  );
}
