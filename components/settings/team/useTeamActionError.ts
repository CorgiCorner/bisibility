"use client";

import { useSharedErrorMessages } from "@/components/i18n/useSharedErrorMessages";
import { classifyActionError } from "@/lib/ui/action-error";
import { useTranslations } from "next-intl";

type InviteRetry = {
  kind: "create" | "resend";
  unit: "minutes" | "seconds";
  value: number;
};

function parseInviteRetry(message: string): InviteRetry | null {
  const match =
    /^(Too many invitations have been sent|This invitation was sent recently)\. Try again in (\d+) (seconds|minutes)\.$/.exec(
      message,
    );
  if (!match) return null;

  const value = Number(match[2]);
  if (!Number.isSafeInteger(value) || value < 1) return null;

  return {
    kind: match[1] === "Too many invitations have been sent" ? "create" : "resend",
    unit: match[3] as InviteRetry["unit"],
    value,
  };
}

/** Preserves shared stale/digest remediation while translating known team-owned failures. */
export function useTeamActionError() {
  const sharedErrors = useSharedErrorMessages();
  const t = useTranslations("projectSettingsTeam.errors");

  function knownTeamError(message: string) {
    const retry = parseInviteRetry(message);
    if (retry?.kind === "create" && retry.unit === "seconds") {
      return t("inviteRateLimitedSeconds", { count: retry.value });
    }
    if (retry?.kind === "create" && retry.unit === "minutes") {
      return t("inviteRateLimitedMinutes", { count: retry.value });
    }
    if (retry?.kind === "resend" && retry.unit === "seconds") {
      return t("inviteRecentlySentSeconds", { count: retry.value });
    }
    if (retry?.kind === "resend" && retry.unit === "minutes") {
      return t("inviteRecentlySentMinutes", { count: retry.value });
    }
    if (message === "Configure EMAIL_PROVIDER (resend, ses, smtp) to send team invites.") {
      return t("inviteMailer");
    }
    if (message === "This user is already a member.") return t("memberExists");
    if (message === "Member is not editable.") return t("memberNotEditable");
    if (message === "Invite not found.") return t("inviteNotFound");
    if (message === "At least one admin or owner must remain on the project.") {
      return t("lastManager");
    }
    if (message === "Choose another project member to become owner.") {
      return t("chooseNewOwner");
    }
    if (message === "Invitations are temporarily unavailable. Try again shortly.") {
      return t("inviteTemporarilyUnavailable");
    }
    return null;
  }

  return (error: unknown, fallback: string) => {
    if (typeof error === "string") return knownTeamError(error) ?? fallback;
    const classified = classifyActionError(error);
    if (classified.kind === "staleDeployment") return sharedErrors.staleDeployment();
    if (classified.kind === "serverComponentDigest") {
      return sharedErrors.serverComponentDigest({ digest: classified.digest });
    }
    if (classified.kind === "ownedMessage") return knownTeamError(classified.message) ?? fallback;
    return fallback;
  };
}
