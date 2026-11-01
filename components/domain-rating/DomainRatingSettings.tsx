"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { setDomainRatingTracking } from "@/lib/actions/domain-rating";
import type { DomainRatingView } from "@/lib/domain-rating/history";
import { domainRatingSettingsSchema } from "@/lib/domain-rating/settings";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

export function DomainRatingSettings({
  data,
  canEdit,
}: Readonly<{ data: DomainRatingView; canEdit: boolean }>) {
  const t = useTranslations("shared.domainRating");
  const router = useRouter();
  const [notice, setNotice] = useState<"saved" | "saveError" | null>(null);
  const form = useForm<z.infer<typeof domainRatingSettingsSchema>>({
    resolver: zodResolver(domainRatingSettingsSchema),
    defaultValues: { projectId: data.projectId, enabled: data.enabled },
  });
  const submit = form.handleSubmit(async (values) => {
    setNotice(null);
    try {
      await setDomainRatingTracking(values);
      setNotice("saved");
      router.refresh();
    } catch {
      setNotice("saveError");
    }
  });
  return (
    <Card id="domain-rating" size="md" className="mt-5 max-w-[760px] p-5">
      <h2 className="text-[15px] font-semibold">{t("trackingTitle")}</h2>
      <p className="mt-2 text-xs leading-5 text-fg-muted">{t("trackingHelp")}</p>
      <p className="mt-2 text-xs text-fg-muted">{t(data.source ?? "noSource")}</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <Switch
          label={t("enable")}
          disabled={!canEdit || form.formState.isSubmitting}
          {...form.register("enabled")}
        />
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" size="sm" disabled={!canEdit || form.formState.isSubmitting}>
            {t("save")}
          </Button>
          <Link
            className="text-xs underline underline-offset-4"
            href={`${appPath(asProjectRef(data.projectId), "/providers")}?connect=ahrefs#provider-ahrefs`}
          >
            {t(data.hasOwnConnection || data.source ? "manageConnection" : "connect")}
          </Link>
        </div>
        {notice ? (
          <p role={notice === "saveError" ? "alert" : "status"} className="text-xs text-fg-muted">
            {t(notice)}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
