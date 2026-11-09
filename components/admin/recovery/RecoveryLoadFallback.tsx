"use client";
import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";
export function RecoveryLoadFallback({
  loading,
  onLoad,
}: {
  loading: boolean;
  onLoad: () => void;
}) {
  const t = useTranslations("instanceAdmin.recovery");
  return (
    <div className="grid gap-3">
      <p role="status">{t("unavailable")}</p>
      <Button disabled={loading} onClick={onLoad}>
        {t("refresh")}
      </Button>
    </div>
  );
}
