"use client";

import { onboardingFormId } from "@/components/onboarding/onboarding-form-utils";
import { ApiKeyCreateModal } from "@/components/settings/api-keys/ApiKeyCreateModal";
import type { IssuedApiKey } from "@/components/settings/api-keys/api-key-model";
import { Button, CopyButton } from "@/components/ui";
import type { IssueApiKeyInput } from "@/lib/schemas/apiKey";
import { DOCS_URL } from "@/lib/site/site";
import {
  CheckCircleIcon as CheckCircle,
  KeyIcon as Key,
  TerminalWindowIcon as TerminalWindow,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const installCommand = "npm install -g @bisibility/cli";
const loginCommand = 'bisibility auth login --name "mbp16-cli" --scope admin --expires 90';

type StepDeveloperAccessProps = {
  hasApiKey?: boolean;
  issueApiKeyAction?: (input: IssueApiKeyInput) => Promise<IssuedApiKey>;
  onApiKeyIssued?: () => void;
  onComplete?: () => void;
  projectId?: string | null;
};

function CommandRow({ command, label }: Readonly<{ command: string; label: string }>) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-t border-code-border px-3 py-2.5 first:border-t-0">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-code-fg">
        <span className="select-none text-code-faint">$ </span>
        {command}
      </code>
      <CopyButton
        label={label}
        size="sm"
        sx={{ color: "var(--code-faint)", flex: "none" }}
        text={command}
      />
    </div>
  );
}

export function StepDeveloperAccess({
  hasApiKey = false,
  issueApiKeyAction,
  onApiKeyIssued,
  onComplete,
  projectId,
}: Readonly<StepDeveloperAccessProps>) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [keyReady, setKeyReady] = useState(hasApiKey);

  function continueOnboarding() {
    onComplete?.();
  }

  function markKeyReady() {
    setKeyReady(true);
    onApiKeyIssued?.();
    router.refresh();
  }

  return (
    <form
      id={onboardingFormId}
      onSubmit={(event) => {
        event.preventDefault();
        continueOnboarding();
      }}
    >
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.7px] text-accent">
            Developer access
          </span>
          <span className="rounded-full border border-border bg-bg-elev px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.5px] text-fg-muted">
            Optional
          </span>
        </div>
        <h2 className="m-0 mt-2 text-[22px] font-semibold tracking-[-0.6px] text-fg">
          Connect from your terminal or API
        </h2>
        <p className="m-0 mt-2 max-w-[620px] text-[13.5px] leading-[1.6] text-fg-muted">
          CLI sign-in is recommended for local work. Create a project key only for direct API, SDK
          or CI access. You can return to this onboarding page at any time.
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <section className="min-w-0 rounded-[14px] border border-accent bg-accent-soft p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-accent text-white">
              <TerminalWindow aria-hidden size={21} weight="bold" />
            </span>
            <span className="rounded-full bg-accent px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.6px] text-white">
              Recommended
            </span>
          </div>
          <h3 className="m-0 mt-4 text-[16px] font-semibold text-fg">Sign in with the CLI</h3>
          <p className="m-0 mt-1.5 text-[12.5px] leading-[1.55] text-fg-muted">
            Browser consent creates an expiring personal token and stores it in your local CLI
            profile. No secret copy-paste is required.
          </p>
          <div className="mt-4 overflow-hidden rounded-[10px] border border-code-border bg-code-bg">
            <CommandRow command={installCommand} label="Copy install command" />
            <CommandRow command={loginCommand} label="Copy sign-in command" />
          </div>
        </section>

        <section className="min-w-0 rounded-[14px] border border-border-strong bg-bg-elev p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-bg-sunken text-fg-muted">
              <Key aria-hidden size={21} weight="bold" />
            </span>
            {keyReady ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-soft px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.6px] text-green">
                <CheckCircle aria-hidden size={12} weight="fill" /> Key ready
              </span>
            ) : null}
          </div>
          <h3 className="m-0 mt-4 text-[16px] font-semibold text-fg">Create a project API key</h3>
          <p className="m-0 mt-1.5 text-[12.5px] leading-[1.55] text-fg-muted">
            Use a scoped key for REST API calls, SDKs and CI. The full secret is shown once, so
            store it in your secret manager when it appears.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              disabled={!issueApiKeyAction || !projectId}
              onClick={() => setCreateOpen(true)}
              size="sm"
              startIcon={<Key aria-hidden size={14} weight="bold" />}
              type="button"
              variant={keyReady ? "secondary" : "primary"}
            >
              {keyReady ? "Create another key" : "Create API key"}
            </Button>
            <Link
              className="text-[12px] font-semibold text-accent hover:text-accent-hover"
              href={`${DOCS_URL}/api`}
              rel="noreferrer noopener"
              target="_blank"
            >
              API docs
            </Link>
          </div>
        </section>
      </div>

      <ApiKeyCreateModal
        defaultName="Development"
        issueKey={issueApiKeyAction}
        onClose={() => setCreateOpen(false)}
        onIssued={markKeyReady}
        open={createOpen}
        projectId={projectId ?? undefined}
      />
    </form>
  );
}
