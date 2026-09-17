"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { ShieldWarningIcon as ShieldWarning } from "@phosphor-icons/react/dist/csr/ShieldWarning";
import { useTranslations } from "next-intl";

export function AuditNotAuthorized() {
  const t = useTranslations("projectAudit.empty");

  return (
    <div className="max-w-[720px]">
      <EmptyState
        description={t("restrictedDescription")}
        icon={<ShieldWarning aria-hidden size={30} weight="regular" />}
        title={t("restrictedTitle")}
      />
    </div>
  );
}
