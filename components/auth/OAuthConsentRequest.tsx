import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { API_KEY_EXPIRY_DAYS } from "@/lib/api/api-key-policy";
import { canCreateOAuthApiTokens, getOAuthConsentCopy } from "@/lib/auth/oauth-consent-copy";
import type { OAuthConsentClient } from "@/lib/auth/oauth-consent-types";
import {
  OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  OAUTH_REFRESH_TOKEN_TTL_SECONDS,
} from "@/lib/auth/oauth-policy";
import { useTranslations } from "next-intl";
import { OAuthConsentScopes } from "./OAuthConsentScopes";
import { formatOAuthConsentCountdown } from "./useOAuthConsentCountdown";

const ACCESS_TOKEN_TTL_HOURS = OAUTH_ACCESS_TOKEN_TTL_SECONDS / (60 * 60);
const REFRESH_TOKEN_TTL_DAYS = OAUTH_REFRESH_TOKEN_TTL_SECONDS / (24 * 60 * 60);

type OAuthConsentRequestProps = {
  client: OAuthConsentClient;
  disabled: boolean;
  error: string | null;
  onChoose: (accept: boolean) => void;
  pendingChoice: "accept" | "deny" | null;
  secondsLeft: number;
  scopes: string[];
};

function redirectDomain(label: string | null) {
  if (!label) return null;
  try {
    return new URL(`https://${label}`).hostname;
  } catch {
    return null;
  }
}

function TechnicalDetails({
  client,
  scopes,
}: Readonly<{ client: OAuthConsentClient; scopes: string[] }>) {
  const t = useTranslations("auth.oauthConsent");
  const renewsAccess = scopes.includes("offline_access");
  const createsApiTokens = canCreateOAuthApiTokens(scopes);
  return (
    <details className="mt-5 text-[12px] text-fg-muted">
      <summary className="w-fit cursor-pointer rounded-control underline decoration-border underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-solid">
        {t("technical.summary")}
      </summary>
      <dl className="mt-3 mb-0 space-y-3 rounded-control bg-bg-inset p-3 [&_dd]:m-0 [&_dd]:break-all [&_dd]:text-fg [&_dt]:mb-0.5">
        <div>
          <dt>{t("technical.clientId")}</dt>
          <dd>{client.id || t("technical.unavailable")}</dd>
        </div>
        {client.redirectUri ? (
          <div>
            <dt>{t("technical.redirectUri")}</dt>
            <dd>{client.redirectUri}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t("technical.requestedScopes")}</dt>
          <dd>{scopes.length ? [...new Set(scopes)].join(", ") : t("technical.noScopes")}</dd>
        </div>
        <div>
          <dt>{t("technical.accessExpiry")}</dt>
          <dd>{t("accessTokenLifetime", { hours: ACCESS_TOKEN_TTL_HOURS })}</dd>
        </div>
        {renewsAccess ? (
          <div>
            <dt>{t("technical.refreshExpiry")}</dt>
            <dd>{t("technical.refreshLifetime", { days: REFRESH_TOKEN_TTL_DAYS })}</dd>
          </div>
        ) : null}
        {createsApiTokens ? (
          <div>
            <dt>{t("technical.apiExpiry")}</dt>
            <dd>
              {t.rich("technical.apiLifetime", {
                days: API_KEY_EXPIRY_DAYS.join(", "),
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

export function OAuthConsentRequest({
  client,
  disabled,
  error,
  onChoose,
  pendingChoice,
  scopes,
  secondsLeft,
}: Readonly<OAuthConsentRequestProps>) {
  const t = useTranslations("auth.oauthConsent");
  const { clientName } = getOAuthConsentCopy(client);
  const domain = redirectDomain(client.redirectUri);
  const renewsAccess = scopes.includes("offline_access");
  return (
    <Card className="w-full min-w-0 max-w-[520px] p-5 sm:p-7" size="lg">
      <h1 className="m-0 break-words text-[24px] font-semibold leading-[1.25] tracking-[-0.7px] [overflow-wrap:anywhere]">
        <bdi>{clientName ? t("headingNamed", { client: clientName }) : t("headingGeneric")}</bdi>
      </h1>
      <p className="mt-3 mb-0 text-[12px] leading-[1.6] text-fg-muted">
        {domain ? (
          <>
            <bdi className="break-all font-medium text-fg">{domain}</bdi>
            {" · "}
          </>
        ) : null}
        {client.dynamic ? t("originDynamic") : t("originFirstParty")}
      </p>
      <OAuthConsentScopes scopes={scopes} />
      <p className="mt-5 mb-0 text-[12.5px] leading-[1.6] text-fg-muted">
        {renewsAccess
          ? t("accessRenews", { hours: ACCESS_TOKEN_TTL_HOURS })
          : t("accessLasts", { hours: ACCESS_TOKEN_TTL_HOURS })}
      </p>
      <TechnicalDetails client={client} scopes={scopes} />
      <p className="mt-5 mb-0 break-words text-[13px] leading-[1.6] [overflow-wrap:anywhere]">
        <bdi>
          {clientName ? t("descriptionNamed", { client: clientName }) : t("descriptionGeneric")}
        </bdi>
      </p>
      {error ? (
        <p role="alert" className="mt-4 mb-0 text-[13px] text-red-text">
          {error}
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Button
          className="w-full"
          disabled={disabled}
          loading={pendingChoice === "deny"}
          loadingLabel={t("denying")}
          onClick={() => onChoose(false)}
          size="lg"
          type="button"
          variant="secondary"
        >
          {t("deny")}
        </Button>
        <Button
          className="h-auto min-h-11 w-full whitespace-normal py-2 [overflow-wrap:anywhere]"
          disabled={disabled}
          loading={pendingChoice === "accept"}
          loadingLabel={t("approving")}
          onClick={() => onChoose(true)}
          size="lg"
          type="button"
        >
          <bdi>{clientName ? t("allowNamed", { client: clientName }) : t("allowGeneric")}</bdi>
        </Button>
      </div>
      <p
        className={`mt-3 mb-0 text-center text-[11px] tabular-nums ${secondsLeft <= 60 ? "text-red-text" : "text-fg-muted"}`}
      >
        {t("requestExpiresIn", { time: formatOAuthConsentCountdown(secondsLeft) })}
      </p>
    </Card>
  );
}
