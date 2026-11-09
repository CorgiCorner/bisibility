"use client";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
export function AdminRouteRefresh({ loading = false }: { loading?: boolean }) {
  const router = useRouter();
  const t = useTranslations("instanceAdmin.shell");
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending || loading}
      onClick={() => start(() => router.refresh())}
    >
      {t(pending || loading ? "refreshing" : "refreshData")}
    </Button>
  );
}
