import { ExternalLink } from "@/components/ui/ExternalLink";
import { DOCS_URL } from "@/lib/site/site";
import { useTranslations } from "next-intl";

export function EmailSignInUnavailable() {
  const t = useTranslations("auth.emailUnavailable");
  return (
    <div className="rounded-card border border-yellow bg-[color-mix(in_srgb,var(--yellow)_8%,transparent)] p-4">
      <h2 className="m-0 text-base font-semibold text-fg">{t("title")}</h2>
      <p className="mt-2 mb-0 text-[13px] leading-relaxed text-fg-muted">{t("description")}</p>
      <ExternalLink
        className="mt-3 text-[13px] font-semibold text-accent-text hover:underline"
        href={`${DOCS_URL}/self-hosting/email`}
      >
        {t("action")}
      </ExternalLink>
    </div>
  );
}
