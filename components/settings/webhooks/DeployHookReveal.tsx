"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { KeyIcon as Key } from "@phosphor-icons/react/dist/csr/Key";
import { useTranslations } from "next-intl";
import type { IssuedDeployHook } from "./deploy-hook-model";

type DeployHookRevealContentProps = {
  endpointUrl: string;
  issuedHook: IssuedDeployHook;
};

function tokenUrl(endpointUrl: string, token: string) {
  const url = new URL(endpointUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

function curlExample(endpointUrl: string) {
  return `curl -X POST '${endpointUrl}' \\
  -H 'Authorization: Bearer <ingest-hook-token>' \\
  -H 'Content-Type: application/json' \\
  --data '{"deployment_id":"deploy_123","environment":"production","url":"https://example.com"}'`;
}

export function DeployHookRevealContent({
  endpointUrl,
  issuedHook,
}: Readonly<DeployHookRevealContentProps>) {
  const t = useTranslations("projectSettingsDevelopers.webhooks");
  const webhookUrl = tokenUrl(endpointUrl, issuedHook.raw);
  const curl = curlExample(endpointUrl);

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-yellow bg-yellow/10 px-3.5 py-3">
        <div className="flex items-start gap-2.5">
          <Key
            aria-hidden
            className="mt-0.5 flex-none text-yellow-text"
            size={17}
            weight="regular"
          />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-fg">{t("revealWarning")}</div>
            <p className="m-0 mt-1 text-[12px] leading-[1.5] text-fg-muted">{t("revealStorage")}</p>
          </div>
        </div>
      </div>
      <div>
        <div className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          {t("urlLabel")}
        </div>
        <div className="mt-[7px] flex items-center gap-2 rounded-control border border-border bg-transparent px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate">{webhookUrl}</span>
          <CopyButton
            label={t("copyUrl", { label: issuedHook.label })}
            size="md"
            text={webhookUrl}
          />
        </div>
        <p className="m-0 mt-1.5 text-[11.5px] leading-[1.5] text-fg-muted">{t("urlHelp")}</p>
      </div>
      <div>
        <div className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          {t("tokenLabel")}
        </div>
        <div className="mt-[7px] flex items-center gap-2 rounded-control border border-border bg-transparent px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate">{issuedHook.raw}</span>
          <CopyButton
            label={t("copyToken", { label: issuedHook.label })}
            size="md"
            text={issuedHook.raw}
          />
        </div>
        <p className="m-0 mt-1.5 text-[11.5px] leading-[1.5] text-fg-muted">{t("tokenHelp")}</p>
      </div>
      <div>
        <div className="font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          {t("curlLabel")}
        </div>
        <div className="mt-[7px] flex items-start gap-2 rounded-control border border-border bg-code-bg px-3 py-2.5">
          <pre className="m-0 min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.55] text-code-fg">
            {curl}
          </pre>
          <CopyButton label={t("copyCurl", { label: issuedHook.label })} size="md" text={curl} />
        </div>
        <p className="m-0 mt-1.5 text-[11.5px] leading-[1.5] text-fg-muted">{t("curlHelp")}</p>
      </div>
    </div>
  );
}
