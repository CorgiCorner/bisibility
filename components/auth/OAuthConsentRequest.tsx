import { Button, Card, InfoTooltip } from "@/components/ui";
import type { OAuthConsentClient } from "@/lib/auth/oauth-consent-types";
import {
  OAUTH_ACCESS_TOKEN_TTL_LABEL,
  OAUTH_REFRESH_TOKEN_TTL_LABEL,
} from "@/lib/auth/oauth-policy";
import {
  ArrowRightIcon as ArrowRight,
  ArrowUDownLeftIcon as ArrowUDownLeft,
  ClockIcon as Clock,
  HourglassIcon as Hourglass,
  ShieldCheckIcon as ShieldCheck,
} from "@phosphor-icons/react";
import { OAuthConsentScopes } from "./OAuthConsentScopes";
import { formatOAuthConsentCountdown } from "./useOAuthConsentCountdown";

type OAuthConsentRequestProps = {
  client: OAuthConsentClient;
  disabled: boolean;
  error: string | null;
  onChoose: (accept: boolean) => void;
  pendingChoice: "accept" | "deny" | null;
  secondsLeft: number;
  scopes: string[];
};

function ClientBox({ client }: Readonly<{ client: OAuthConsentClient }>) {
  return (
    <div className="mt-4 rounded-[11px] bg-bg-inset px-[13px] py-[11px]">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.5px] text-fg-faint">
          Client
        </span>
        {client.dynamic ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-bg-elev px-2 py-0.5 font-mono text-[10px] font-semibold text-fg-muted">
            DCR
            <InfoTooltip text="Registered dynamically, so the id is random. Only approve one you just triggered yourself." />
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 mb-0 text-[13px] font-semibold text-fg">{client.name}</p>
      <p className="mt-0.5 mb-0 break-all font-mono text-[11.5px] font-semibold text-fg-muted">
        {client.id || "Unknown client"}
      </p>
      {client.redirectUri ? (
        <p className="mt-1.5 mb-0 flex items-start gap-2 break-all font-mono text-[10.5px] text-fg-faint">
          <ArrowUDownLeft aria-hidden className="mt-0.5 shrink-0" size={13} />
          {client.redirectUri}
        </p>
      ) : null}
    </div>
  );
}

function TokenLifetime({ refresh }: Readonly<{ refresh: boolean }>) {
  return (
    <dl className="mt-4 mb-0 border-border border-t pt-3">
      <div className="flex items-center gap-2 text-[12.5px]">
        <Clock aria-hidden className="text-fg-faint" size={14} />
        <dt className="flex items-center gap-1.5 text-fg-muted">
          Access token
          <InfoTooltip text="The short-lived credential this client uses to call Bisibility. It expires after 1 hour." />
        </dt>
        <dd className="ml-auto font-mono font-semibold text-fg">{OAUTH_ACCESS_TOKEN_TTL_LABEL}</dd>
      </div>
      {refresh ? (
        <div className="mt-2 flex items-center gap-2 text-[12.5px]">
          <Hourglass aria-hidden className="text-fg-faint" size={14} />
          <dt className="flex items-center gap-1.5 text-fg-muted">
            Refresh access
            <InfoTooltip text="Allows this client to obtain new access tokens for up to 30 days without asking you to approve every hour." />
          </dt>
          <dd className="ml-auto font-mono font-semibold text-fg">
            {OAUTH_REFRESH_TOKEN_TTL_LABEL}
          </dd>
        </div>
      ) : null}
    </dl>
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
  const expiring = secondsLeft <= 60;
  return (
    <Card className="w-full max-w-[520px] p-5 sm:p-6" size="lg">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent">
          <ShieldCheck aria-hidden size={21} weight="fill" />
        </span>
        <div>
          <p className="m-0 font-mono text-[10.5px] uppercase tracking-[0.5px] text-fg-faint">
            Authorization request
          </p>
          <h2 className="mt-1 mb-0 text-[19px] font-semibold tracking-[-0.6px] text-fg">
            Allow this client?
          </h2>
        </div>
        <span
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold ${
            expiring ? "border-red/40 text-red" : "border-border-strong text-fg-faint"
          }`}
        >
          <Clock aria-hidden size={13} />
          expires in {formatOAuthConsentCountdown(secondsLeft)}
        </span>
      </div>

      <ClientBox client={client} />
      <OAuthConsentScopes scopes={scopes} />
      <TokenLifetime refresh={scopes.includes("offline_access")} />

      {error ? <p className="mt-4 mb-0 text-[13px] text-red">{error}</p> : null}

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <Button
          className="w-full"
          disabled={disabled}
          loading={pendingChoice === "deny"}
          loadingLabel="Denying"
          onClick={() => onChoose(false)}
          size="lg"
          type="button"
          variant="secondary"
        >
          Deny
        </Button>
        <Button
          className="w-full"
          disabled={disabled}
          endIcon={<ArrowRight aria-hidden size={16} weight="bold" />}
          loading={pendingChoice === "accept"}
          loadingLabel="Approving"
          onClick={() => onChoose(true)}
          size="lg"
          type="button"
        >
          Allow
        </Button>
      </div>
    </Card>
  );
}
