"use client";

import { Button, Card } from "@/components/ui";
import { authClient } from "@/lib/auth/client";
import { zodResolver } from "@/lib/forms/zod-resolver";
import {
  ArrowSquareOutIcon as ArrowSquareOut,
  CircleNotchIcon as CircleNotch,
  ShieldCheckIcon as ShieldCheck,
  XCircleIcon as XCircle,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const consentSchema = z.object({
  accept: z.boolean(),
});

type ConsentValues = z.infer<typeof consentSchema>;

type OAuthConsentFormProps = {
  clientId: string;
  scopes: string[];
};

const scopeLabels: Record<string, string> = {
  openid: "Identity",
  profile: "Profile",
  email: "Email",
  offline_access: "Refresh access",
  "tokens:write": "Create a personal access token for this client",
};

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  if (error && typeof error === "object" && "error_description" in error) {
    const description = (error as { error_description?: unknown }).error_description;
    if (typeof description === "string") return description;
  }

  return "Could not complete the consent request.";
}

// Consent redirects accept only same-origin paths or absolute HTTP(S) URLs to
// block executable schemes.
function isSafeRedirect(target: string) {
  if (target.startsWith("/") && !target.startsWith("//")) return true;
  try {
    const url = new URL(target, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function OAuthConsentForm({ clientId, scopes }: Readonly<OAuthConsentFormProps>) {
  const [pendingChoice, setPendingChoice] = useState<"accept" | "deny" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ConsentValues>({
    defaultValues: { accept: true },
    resolver: zodResolver(consentSchema),
  });
  const missingRequest = !clientId;

  async function submitConsent(values: ConsentValues) {
    setFormError(null);

    try {
      const response = await authClient.oauth2.consent({ accept: values.accept });
      if (response.error) {
        setFormError(errorMessage(response.error));
        return;
      }

      const redirectUrl = response.data?.url;
      if (typeof redirectUrl !== "string" || !redirectUrl) {
        setFormError("Consent response did not include a redirect URI.");
        return;
      }

      if (!isSafeRedirect(redirectUrl)) {
        setFormError("Consent response returned an unsupported redirect URI.");
        return;
      }

      window.location.assign(redirectUrl);
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setPendingChoice(null);
    }
  }

  function choose(accept: boolean) {
    setPendingChoice(accept ? "accept" : "deny");
    form.setValue("accept", accept, { shouldValidate: true });
    void form.handleSubmit(submitConsent)();
  }

  return (
    <Card className="w-full max-w-[440px]" size="lg">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent">
          <ShieldCheck aria-hidden size={21} weight="fill" />
        </span>
        <div>
          <p className="m-0 font-mono text-[11px] uppercase tracking-[0.5px] text-fg-faint">
            Authorization request
          </p>
          <h2 className="mt-1 mb-0 text-[21px] font-semibold tracking-[-0.45px] text-fg">
            Allow this client?
          </h2>
        </div>
      </div>

      <div className="mt-5 rounded-[12px] border border-border bg-bg-sunken p-4">
        <p className="m-0 font-mono text-[10.5px] uppercase tracking-[0.5px] text-fg-faint">
          Client
        </p>
        <p className="mt-1 mb-0 break-all font-mono text-[13px] font-semibold text-fg">
          {clientId || "Unknown client"}
        </p>
      </div>

      <div className="mt-4">
        <p className="m-0 font-mono text-[10.5px] uppercase tracking-[0.5px] text-fg-faint">
          Requested scopes
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(scopes.length ? scopes : ["openid"]).map((scope) => (
            <span
              className="rounded-full border border-border-strong bg-bg-elev px-3 py-1.5 font-mono text-[11.5px] font-semibold text-fg-muted"
              key={scope}
            >
              {scopeLabels[scope] ?? scope}
            </span>
          ))}
        </div>
      </div>

      {formError ? <p className="mt-4 mb-0 text-[13px] text-red">{formError}</p> : null}

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <Button
          disabled={missingRequest || pendingChoice !== null}
          loading={pendingChoice === "deny"}
          loadingLabel="Denying"
          onClick={() => choose(false)}
          startIcon={
            pendingChoice === "deny" ? (
              <CircleNotch aria-hidden className="bv-spin" size={15} weight="bold" />
            ) : (
              <XCircle aria-hidden size={16} weight="bold" />
            )
          }
          type="button"
          variant="secondary"
        >
          Deny
        </Button>
        <Button
          disabled={missingRequest || pendingChoice !== null}
          loading={pendingChoice === "accept"}
          loadingLabel="Approving"
          onClick={() => choose(true)}
          startIcon={
            pendingChoice === "accept" ? (
              <CircleNotch aria-hidden className="bv-spin" size={15} weight="bold" />
            ) : (
              <ArrowSquareOut aria-hidden size={16} weight="bold" />
            )
          }
          type="button"
        >
          Accept
        </Button>
      </div>
    </Card>
  );
}
