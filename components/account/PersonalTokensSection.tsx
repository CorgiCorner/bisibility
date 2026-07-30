"use client";

import { ApiKeyRevealContent } from "@/components/settings/api-keys/ApiKeyReveal";
import { apiKeyScopeLabel, apiKeyScopeOptions } from "@/components/settings/api-keys/api-key-model";
import { Button, ConfirmModal, ExpiryChoiceGroup, Modal, MonoText } from "@/components/ui";
import type { PersonalTokenData } from "@/lib/queries/personal-tokens";
import type { IssuePersonalTokenInput } from "@/lib/schemas/personalToken";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import {
  CheckCircleIcon as CheckCircle,
  PlusIcon as Plus,
  TrashIcon as Trash,
  UserGearIcon as UserGear,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AccountSection } from "./AccountSection";

export type IssuedPersonalToken = {
  maskedValue: string;
  name: string;
  raw: string;
};

export type PersonalTokensSectionProps = {
  issueToken: (input: IssuePersonalTokenInput) => Promise<IssuedPersonalToken>;
  revokeToken: (input: { tokenId: string }) => Promise<unknown>;
  tokens: readonly PersonalTokenData[];
};

const expiryOptions = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
  { days: null, label: "No expiry" },
] as const;

const inputClass =
  "mt-[7px] min-h-11 w-full rounded-[9px] border border-border-strong bg-bg-sunken px-[13px] font-mono text-[13.5px] font-medium text-fg outline-none focus:border-accent";
const labelClass = "font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint";

export function PersonalTokensSection({
  issueToken,
  revokeToken,
  tokens,
}: Readonly<PersonalTokensSectionProps>) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<IssuePersonalTokenInput["scope"]>("read");
  const [expiresInDays, setExpiresInDays] = useState<IssuePersonalTokenInput["expiresInDays"]>(90);
  const [issued, setIssued] = useState<IssuedPersonalToken | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<PersonalTokenData | null>(null);

  function closeCreate() {
    setCreateOpen(false);
    setIssued(null);
    setName("");
    setScope("read");
    setExpiresInDays(90);
    setMessage(null);
  }

  function onCreate() {
    setMessage(null);
    startTransition(() => {
      void issueToken({ expiresInDays, name: name.trim(), scope })
        .then((token) => {
          setIssued(token);
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Personal token could not be created.")),
        );
    });
  }

  function onRevoke(tokenId: string) {
    setMessage(null);
    startTransition(() => {
      void revokeToken({ tokenId })
        .then(() => {
          setRevokeTarget(null);
          setMessage("Personal access token revoked.");
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Personal token could not be revoked.")),
        );
    });
  }

  return (
    <AccountSection
      action={
        <Button
          onClick={() => setCreateOpen(true)}
          size="sm"
          startIcon={<Plus aria-hidden size={14} weight="bold" />}
          type="button"
          variant="secondary"
        >
          Create token
        </Button>
      }
      description="Account-wide API tokens (bsb_pat_) that act as you across every project you belong to. Also issued by `bisibility auth login`."
      title="Personal access tokens"
    >
      {tokens.length > 0 ? (
        <div className="divide-y divide-border-soft rounded-[10px] border border-border bg-bg-elev">
          {tokens.map((token) => (
            <div className="flex items-center gap-3 p-3" key={token.id}>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">
                  {token.name}
                  <span className="ml-2 rounded-[7px] border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-faint">
                    {apiKeyScopeLabel(token.scope)}
                  </span>
                </span>
                <MonoText className="mt-0.5 truncate" size="lg">
                  {token.maskedValue}
                </MonoText>
                <MonoText className="mt-1" muted>
                  {token.createdLabel} · {token.lastUsedLabel} · {token.expiresLabel}
                </MonoText>
              </span>
              <button
                aria-label={`Revoke ${token.name} token`}
                className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg border border-border-strong bg-bg-elev text-red hover:border-red disabled:cursor-not-allowed disabled:opacity-55"
                disabled={isPending}
                onClick={() => setRevokeTarget(token)}
                type="button"
              >
                <Trash size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-[14px] border border-border bg-bg-elev px-6 py-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-[13px] bg-bg-sunken text-fg-faint">
            <UserGear aria-hidden size={23} />
          </span>
          <div className="mt-3 text-[14.5px] font-semibold">No personal tokens yet</div>
          <p className="m-0 mt-1.5 max-w-[400px] text-[12.5px] leading-[1.55] text-fg-muted">
            Personal tokens unlock account-level automation: create projects, mint project API keys
            and manage webhooks from the CLI, SDKs and MCP.
          </p>
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            startIcon={<Plus aria-hidden size={14} weight="bold" />}
            sx={{ marginTop: "16px" }}
            type="button"
          >
            Create your first token
          </Button>
        </div>
      )}
      {message ? <span className="text-[11.5px] font-medium text-fg-muted">{message}</span> : null}
      <Modal
        footer={
          issued ? (
            <Button
              onClick={closeCreate}
              size="sm"
              startIcon={<CheckCircle aria-hidden size={15} />}
              type="button"
            >
              Done
            </Button>
          ) : (
            <>
              <Button onClick={closeCreate} size="sm" type="button" variant="ghost">
                Cancel
              </Button>
              <Button
                disabled={!name.trim() || isPending}
                loading={isPending}
                loadingLabel="Creating"
                onClick={onCreate}
                startIcon={<Plus aria-hidden size={15} weight="bold" />}
                type="button"
              >
                Create token
              </Button>
            </>
          )
        }
        headerDivider
        onClose={closeCreate}
        open={createOpen}
        size="md"
        title={
          <span className="block">
            <span className="block">{issued ? "New personal token" : "Create personal token"}</span>
            <span className="mt-1 block text-[12.5px] font-normal tracking-normal text-fg-muted">
              {issued
                ? "The full secret is available one time."
                : "The token acts as you in every project, capped by your role there."}
            </span>
          </span>
        }
      >
        {issued ? (
          <ApiKeyRevealContent issuedKey={issued} />
        ) : (
          <div className="space-y-[18px]">
            <div>
              <label className={labelClass} htmlFor="personal-token-name">
                Token name
              </label>
              <input
                autoComplete="off"
                className={inputClass}
                id="personal-token-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="CI automation"
                value={name}
              />
            </div>
            <div>
              <div className={labelClass}>Scope</div>
              <div className="mt-[9px] grid gap-[7px]">
                {apiKeyScopeOptions.map((option) => {
                  const active = scope === option.value;
                  return (
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-[11px] border-[1.5px] px-[13px] py-[11px]",
                        active ? "border-accent bg-accent-soft" : "border-border-strong bg-bg-elev",
                      )}
                      key={option.value}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-fg">
                          {option.label}
                        </span>
                        <span className="mt-px block text-[11.5px] text-fg-muted">
                          {option.desc}
                        </span>
                      </span>
                      <input
                        checked={active}
                        className="sr-only"
                        name="personal-token-scope"
                        onChange={() => setScope(option.value)}
                        type="radio"
                        value={option.value}
                      />
                      <span
                        className={cn(
                          "grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-[1.5px]",
                          active ? "border-accent" : "border-border-strong",
                        )}
                      >
                        <span
                          className={cn(
                            "h-[9px] w-[9px] rounded-full bg-accent",
                            !active && "invisible",
                          )}
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <ExpiryChoiceGroup
              onChange={setExpiresInDays}
              options={expiryOptions}
              value={expiresInDays}
            />
            {message ? <div className="text-[12px] font-medium text-red">{message}</div> : null}
          </div>
        )}
      </Modal>
      <ConfirmModal
        busy={isPending}
        kind="revokeKey"
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (revokeTarget) onRevoke(revokeTarget.id);
        }}
        open={Boolean(revokeTarget)}
      />
    </AccountSection>
  );
}
