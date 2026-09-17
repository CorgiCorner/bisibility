import type { IntegrationProviderData } from "@/lib/integrations/types";
import { useTranslations } from "next-intl";

export function ProviderCredentialWarning({
  credentialIssue,
}: Pick<IntegrationProviderData, "credentialIssue">) {
  const t = useTranslations("projectIntegrations.provider");
  if (credentialIssue !== "unreadable") return null;

  return (
    <p
      className="m-0 mt-3 rounded-control border border-red bg-red/5 px-3 py-2 text-[12.5px] leading-[1.45] text-red-text"
      role="alert"
    >
      {t("credentialUnreadable")}
    </p>
  );
}
