"use client";
import { settingsCardNaturalFrameClassName } from "@/components/settings/shell/settings-layout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import {
  checkProjectDomainVerification,
  startProjectDomainVerification,
} from "@/lib/actions/domain-verification";
import type { verificationResource } from "@/lib/domain-verification/service";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

type Verification = ReturnType<typeof verificationResource>;
type Props = { projectId: string; initial: Verification; canEdit: boolean };
export function DomainVerificationCard({ projectId, initial, canEdit }: Props) {
  const t = useTranslations("projectSettingsGeneral.domainVerification");
  const [verification, setVerification] = useState(initial);
  const [message, setMessage] = useState<"error" | "copied" | null>(null);
  const [pending, startTransition] = useTransition();
  function run(method?: "dns_txt" | "search_console") {
    startTransition(async () => {
      setMessage(null);
      try {
        setVerification(
          method
            ? await startProjectDomainVerification({ projectId, method })
            : await checkProjectDomainVerification({ projectId }),
        );
      } catch {
        setMessage("error");
      }
    });
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("copied");
    } catch {
      setMessage("error");
    }
  }
  return (
    <Card className={`${settingsCardNaturalFrameClassName} grid gap-4`} data-domain-verification="">
      <div>
        <SectionTitle>{t("title")}</SectionTitle>
        <p className="mt-1 text-sm text-fg-muted">{t("description")}</p>
      </div>
      <p role="status" className="text-sm">
        {verification?.verified_at
          ? t(verification.method === "dns_txt" ? "verifiedDns" : "verifiedSearch")
          : t("unverified")}
      </p>
      {verification?.method === "dns_txt" && (
        <dl className="grid min-w-0 gap-3 text-sm">
          <div>
            <dt className="font-medium">{t("recordHost")}</dt>
            <dd className="break-all">{verification.dns_host}</dd>
          </div>
          <div>
            <dt className="font-medium">{t("recordValue")}</dt>
            <dd className="break-all">{verification.dns_value}</dd>
          </div>
          <div>
            <Button size="xs" variant="outline" onClick={() => copy(verification.dns_value)}>
              {t("copy")}
            </Button>
          </div>
        </dl>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!canEdit || pending}
          onClick={() => run("dns_txt")}
        >
          {t("startDns")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!canEdit || pending}
          onClick={() => run("search_console")}
        >
          {t("startSearch")}
        </Button>
        {verification && (
          <Button
            size="sm"
            variant="secondary"
            disabled={!canEdit || pending}
            onClick={() => run()}
          >
            {t("check")}
          </Button>
        )}
      </div>
      {message && (
        <p role="status" className="text-sm text-fg-muted">
          {t(message)}
        </p>
      )}
    </Card>
  );
}
