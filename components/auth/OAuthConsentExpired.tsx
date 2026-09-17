import { Card } from "@/components/ui/Card";
import { getOAuthConsentCopy } from "@/lib/auth/oauth-consent-copy";
import type { OAuthConsentClient } from "@/lib/auth/oauth-consent-types";
import { HourglassLowIcon as HourglassLow } from "@phosphor-icons/react/dist/csr/HourglassLow";
import { useTranslations } from "next-intl";

export function OAuthConsentExpired({ client }: Readonly<{ client: OAuthConsentClient }>) {
  const t = useTranslations("auth.oauthConsent");
  const copy = getOAuthConsentCopy(client);
  return (
    <Card className="w-full max-w-[520px] p-6 sm:p-8" size="lg">
      <span className="grid h-11 w-11 place-items-center rounded-card bg-yellow/15 text-yellow-text">
        <HourglassLow aria-hidden size={24} weight="regular" />
      </span>
      <h1 className="mt-5 mb-0 text-[20px] font-semibold tracking-[-0.5px]">{t("expiredTitle")}</h1>
      <p className="mt-3 mb-0 text-[14px] leading-[1.6] text-fg-muted">{t("expiredDescription")}</p>
      <p className="mt-2 mb-0 text-[14px] leading-[1.6] text-fg-muted">
        {copy.retryCommand ? t("retryCommand") : t("retryClient")}
      </p>
      {copy.retryCommand ? (
        <div className="mt-4 rounded-control bg-code-bg px-4 py-3 font-sans text-[12px] text-code-fg">
          <span className="mr-3 text-code-faint">→</span>
          <code>{copy.retryCommand}</code>
        </div>
      ) : null}
      <p className="mt-4 mb-0 text-[12.5px] text-fg-muted">{t("closeTab")}</p>
    </Card>
  );
}
