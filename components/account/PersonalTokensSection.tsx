"use client";

import { ApiKeySecretReveal } from "@/components/settings/api-keys/ApiKeyReveal";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ExpiryChoiceGroup } from "@/components/ui/ExpiryChoiceGroup";
import { inputClassName } from "@/components/ui/input-styles";
import { Modal } from "@/components/ui/Modal";
import type { DateFormatPreference } from "@/lib/format/user-datetime";
import type { PersonalTokenData } from "@/lib/queries/personal-tokens";
import type { IssuePersonalTokenInput } from "@/lib/schemas/personalToken";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { TrashIcon as Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { UserGearIcon as UserGear } from "@phosphor-icons/react/dist/csr/UserGear";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { AccountSection } from "./AccountSection";
import { PersonalTokenDateLabels } from "./PersonalTokenDateLabels";
import { PersonalTokenScopeOptions } from "./PersonalTokenScopeOptions";
import { personalTokenScopeValues } from "./personal-token-model";
import { useAccountActionError } from "./useAccountActionError";

export type IssuedPersonalToken = { maskedValue: string; name: string; raw: string };
export type PersonalTokensSectionProps = {
  dateFormat: DateFormatPreference;
  issueToken: (input: IssuePersonalTokenInput) => Promise<IssuedPersonalToken>;
  revokeToken: (input: { tokenId: string }) => Promise<unknown>;
  tokens: readonly PersonalTokenData[];
};
const inputClass = `${inputClassName} mt-[7px] min-h-11 w-full rounded-control px-[13px] font-sans tabular-nums text-[13.5px] font-medium`;
const labelClass = "font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted";
export function PersonalTokensSection({
  dateFormat,
  issueToken,
  revokeToken,
  tokens,
}: Readonly<PersonalTokensSectionProps>) {
  const router = useRouter();
  const t = useTranslations("account.security.personalTokens");
  const accountErrors = useAccountActionError();
  const expiryOptions = [
    { days: 30, label: t("expiry.30") },
    { days: 90, label: t("expiry.90") },
    { days: 365, label: t("expiry.365") },
    { days: null, label: t("expiry.never") },
  ] as const;
  const scopeOptions = personalTokenScopeValues.map((value) => ({
    desc: t(`scope.${value}.description`),
    label: t(`scope.${value}.label`),
    value,
  }));
  const [isPending, startTransition] = useTransition();
  const [revokePending, setRevokePending] = useState(false);
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
    startTransition(async () => {
      try {
        const token = await issueToken({ expiresInDays, name: name.trim(), scope });
        setIssued(token);
        router.refresh();
      } catch (error: unknown) {
        setMessage(accountErrors.generic(error, t("createError")));
      }
    });
  }

  async function onRevoke(tokenId: string) {
    setMessage(null);
    setRevokePending(true);
    try {
      await revokeToken({ tokenId });
      setRevokeTarget(null);
      setMessage(t("revoked"));
      router.refresh();
    } catch (error: unknown) {
      setMessage(accountErrors.generic(error, t("revokeError")));
      throw error;
    } finally {
      setRevokePending(false);
    }
  }

  return (
    <AccountSection
      action={
        <Button
          onClick={() => setCreateOpen(true)}
          size="sm"
          startIcon={<Plus aria-hidden size={14} weight="regular" />}
          type="button"
          variant="secondary"
        >
          {t("create")}
        </Button>
      }
      description={t("description")}
      title={t("title")}
    >
      {tokens.length > 0 ? (
        <div className="divide-y divide-border rounded-control border border-border bg-bg-elev">
          {tokens.map((token) => (
            <div className="flex items-center gap-3 p-3" key={token.id}>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">
                  {token.name}
                  <span className="ml-2 rounded-control border border-border px-1.5 py-0.5 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
                    {t(`scope.${token.scope}.label`)}
                  </span>
                </span>
                <span className="mt-0.5 truncate">{token.maskedValue}</span>
                <span className="mt-1">
                  <PersonalTokenDateLabels dateFormat={dateFormat} token={token} />
                </span>
              </span>
              <button
                aria-label={t("revokeAriaLabel", { name: token.name })}
                className="grid h-[30px] w-[30px] flex-none place-items-center rounded-control border border-border-control bg-bg-elev text-red-text hover:border-red disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted"
                disabled={isPending}
                onClick={() => setRevokeTarget(token)}
                type="button"
              >
                <Trash size={14} weight="regular" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-card border border-border bg-bg-elev px-6 py-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-card bg-bg-sunken text-fg-muted">
            <UserGear aria-hidden size={23} weight="regular" />
          </span>
          <div className="mt-3 text-[14.5px] font-semibold">{t("empty.title")}</div>
          <p className="m-0 mt-1.5 max-w-[400px] text-[12.5px] leading-[1.55] text-fg-muted">
            {t("empty.description")}
          </p>
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            startIcon={<Plus aria-hidden size={14} weight="regular" />}
            style={{ marginTop: "16px" }}
            type="button"
          >
            {t("empty.action")}
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
              startIcon={<CheckCircle aria-hidden size={15} weight="regular" />}
              type="button"
            >
              {t("done")}
            </Button>
          ) : (
            <>
              <Button onClick={closeCreate} size="sm" type="button" variant="ghost">
                {t("cancel")}
              </Button>
              <Button
                disabled={!name.trim() || isPending}
                loading={isPending}
                loadingLabel={t("creating")}
                onClick={onCreate}
                startIcon={<Plus aria-hidden size={15} weight="regular" />}
                type="button"
              >
                {t("create")}
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
            <span className="block">{issued ? t("newTitle") : t("createTitle")}</span>
            <span className="mt-1 block text-[12.5px] font-normal tracking-normal text-fg-muted">
              {issued ? t("oneTimeSecret") : t("createDescription")}
            </span>
          </span>
        }
      >
        {issued ? (
          <ApiKeySecretReveal
            copy={{
              copyKey: (name) => t("copyKey", { name }),
              key: t("key"),
              revealStorage: t("revealStorage"),
              revealWarning: t("revealWarning"),
              revealedOnce: t("revealedOnce"),
              storedPrefix: (prefix) => t("storedPrefix", { prefix }),
            }}
            issuedKey={issued}
          />
        ) : (
          <div className="space-y-4.5">
            <div>
              <label className={labelClass} htmlFor="personal-token-name">
                {t("name")}
              </label>
              <input
                autoComplete="off"
                className={inputClass}
                id="personal-token-name"
                onChange={(event) => setName(event.target.value)}
                placeholder={t("namePlaceholder")}
                value={name}
              />
            </div>
            <div>
              <div className={labelClass}>{t("scopeLabel")}</div>
              <PersonalTokenScopeOptions onSelect={setScope} options={scopeOptions} scope={scope} />
            </div>
            <ExpiryChoiceGroup
              label={t("expiry.label")}
              onChange={setExpiresInDays}
              options={expiryOptions}
              value={expiresInDays}
            />
            {message ? (
              <div className="text-[12px] font-medium text-red-text">{message}</div>
            ) : null}
          </div>
        )}
      </Modal>
      <ConfirmModal
        busy={isPending || revokePending}
        kind="revokeKey"
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => (revokeTarget ? onRevoke(revokeTarget.id) : undefined)}
        open={Boolean(revokeTarget)}
      />
    </AccountSection>
  );
}
