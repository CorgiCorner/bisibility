"use client";
import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
export function AdminPageError({ reset }: { reset: () => void }) {
  const t = useTranslations("instanceAdmin.pages");
  return (
    <div role="alert" className="grid gap-3">
      <p>{t("unavailable")}</p>
      <Button variant="secondary" onClick={reset}>
        {t("retry")}
      </Button>
    </div>
  );
}
