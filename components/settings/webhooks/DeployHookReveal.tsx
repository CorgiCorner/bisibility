"use client";

import { CopyButton, MonoText } from "@/components/ui";
import { KeyIcon as Key } from "@phosphor-icons/react";
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
  const webhookUrl = tokenUrl(endpointUrl, issuedHook.raw);
  const curl = curlExample(endpointUrl);

  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-yellow bg-yellow/10 px-3.5 py-3">
        <div className="flex items-start gap-2.5">
          <Key aria-hidden className="mt-0.5 flex-none text-yellow-text" size={17} weight="fill" />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-fg">
              Copy this token now - it will not be shown again.
            </div>
            <p className="m-0 mt-1 text-[12px] leading-[1.5] text-fg-muted">
              bisibility stores only a hash after this window closes.
            </p>
          </div>
        </div>
      </div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          Webhook URL (contains the secret token)
        </div>
        <div className="mt-[7px] flex items-center gap-2 rounded-[10px] border border-border-strong bg-transparent px-3 py-2.5">
          <MonoText className="min-w-0 flex-1 truncate" size="lg">
            {webhookUrl}
          </MonoText>
          <CopyButton label={`Copy ${issuedHook.label} webhook URL`} size="md" text={webhookUrl} />
        </div>
        <p className="m-0 mt-1.5 text-[11.5px] leading-[1.5] text-fg-muted">
          Use this URL only when the provider cannot send custom headers - query strings can end up
          in proxy and access logs. Netlify deploy notifications need this form. Append the provider
          as an extra query parameter, e.g. &amp;provider=netlify (or ?provider=vercel /
          ?provider=amplify when the token is sent as a header instead).
        </p>
      </div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          Bearer token (preferred)
        </div>
        <div className="mt-[7px] flex items-center gap-2 rounded-[10px] border border-border-strong bg-transparent px-3 py-2.5">
          <MonoText className="min-w-0 flex-1 truncate" size="lg">
            {issuedHook.raw}
          </MonoText>
          <CopyButton label={`Copy ${issuedHook.label} token`} size="md" text={issuedHook.raw} />
        </div>
        <p className="m-0 mt-1.5 text-[11.5px] leading-[1.5] text-fg-muted">
          Prefer this token as an Authorization: Bearer header. AWS Amplify EventBridge API
          destinations support that header.
        </p>
      </div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          Test with curl
        </div>
        <div className="mt-[7px] flex items-start gap-2 rounded-[10px] border border-border-strong bg-code-bg px-3 py-2.5">
          <pre className="m-0 min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-[1.55] text-code-fg">
            {curl}
          </pre>
          <CopyButton label={`Copy ${issuedHook.label} curl example`} size="md" text={curl} />
        </div>
        <p className="m-0 mt-1.5 text-[11.5px] leading-[1.5] text-fg-muted">
          Replace the masked token placeholder with the one-time token above, then run the command.
        </p>
      </div>
    </div>
  );
}
