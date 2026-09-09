"use server";

import {
  consumeAccountEmailCodeBudget,
  isCurrentEmailOtpError,
} from "@/lib/actions/account-email-code-budget";
import {
  confirmAccountEmailChangeSchema,
  confirmCurrentAccountEmailVerificationSchema,
  requestAccountEmailChangeSchema,
  requestCurrentAccountEmailVerificationSchema,
} from "@/lib/auth/account-email-change-schema";
import { writeAudit } from "@/lib/auth/audit";
import { auth } from "@/lib/auth/auth";
import { countOtherSessions, revokeOtherSessions } from "@/lib/auth/session-revocation";
import { DATE_FORMAT_PREFERENCES, type DateFormatPreference } from "@/lib/dates/format";
import { resolveDateFormat } from "@/lib/dates/resolve";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { requireMutableAccountSession as requireSession } from "@/lib/demo/mutable-account-session";
import { sendEmailChangedNotice } from "@/lib/email/email-changed-notice";
import { appPath, appRootPath, asProjectRef } from "@/lib/routing/app-path";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

export type AccountEmailChangeCodeRequested = {
  currentEmail: string;
  status: "verification_required";
};

export type AccountEmailChangeRequested = {
  currentEmail: string;
  pendingEmail: string;
  /** Opens code entry without claiming delivery, which would disclose account existence. */
  status: "verification_required";
};

export type AccountEmailChanged = {
  email: string;
  emailVerification: "verified";
  status: "changed";
};

export type CurrentAccountEmailVerificationRequested = {
  email: string;
  status: "verification_required";
};

export type CurrentAccountEmailVerified = {
  email: string;
  emailVerification: "verified";
  status: "verified";
};

async function accountEmailContext(userId: string) {
  const user = await prisma.user.findUnique({
    select: { dateFormat: true, email: true, emailVerified: true, publicId: true },
    where: { id: userId },
  });

  if (!user) {
    throw new Error("Account not found.");
  }
  if (!user.publicId || parsePublicId(user.publicId)?.prefix !== "usr") {
    throw new Error("User public ID is not available.");
  }

  return { ...user, publicId: user.publicId };
}

function sameEmail(currentEmail: string, newEmail: string) {
  return currentEmail.trim().toLowerCase() === newEmail;
}

function requireCurrentEmail(currentEmail: string, email: string) {
  if (!sameEmail(currentEmail, email)) {
    throw new Error("Email does not match the current account.");
  }
}

function revalidateAccountEmailViews() {
  const projectRoute = asProjectRef("[project]");
  revalidatePath(appRootPath(), "layout");
  revalidatePath(appRootPath("account"));
  revalidatePath(appPath(projectRoute, "settings"), "page");
  revalidatePath(appPath(projectRoute, "settings", "notifications"), "page");
}

/**
 * Step one of an email change: send a code to the address already on the account so the
 * change request can prove control of it, not only of the new address.
 */
export async function requestAccountEmailChangeCode(): Promise<AccountEmailChangeCodeRequested> {
  const session = await requireSession();
  await consumeAccountEmailCodeBudget(session.user.id);
  const current = await accountEmailContext(session.user.id);

  try {
    await auth.api.sendVerificationOTP({
      body: { email: current.email, type: "email-verification" },
      headers: await headers(),
    });
  } catch {
    throw new Error("Verification code could not be sent.");
  }

  await writeAudit({
    action: "account.email_change_code_requested",
    actorId: session.user.id,
    after: { email: current.email },
    targetId: current.publicId,
    targetType: "user",
  });

  return { currentEmail: current.email, status: "verification_required" };
}

export async function requestAccountEmailChange(
  input: unknown,
): Promise<AccountEmailChangeRequested> {
  const session = await requireSession();
  const data = requestAccountEmailChangeSchema.parse(input);
  const current = await accountEmailContext(session.user.id);

  if (sameEmail(current.email, data.newEmail)) {
    throw new Error("Enter a different email address.");
  }

  try {
    await auth.api.requestEmailChangeEmailOTP({
      // `otp` is the code from the current address; better-auth rejects the request without it.
      body: { newEmail: data.newEmail, otp: data.currentCode },
      headers: await headers(),
    });
  } catch (error: unknown) {
    if (isCurrentEmailOtpError(error)) {
      throw new Error("The code from your current email is invalid or expired. Request a new one.");
    }
    throw new Error("Verification code could not be sent.");
  }

  await writeAudit({
    action: "account.email_change_requested",
    actorId: session.user.id,
    after: { email: data.newEmail },
    before: { email: current.email },
    targetId: current.publicId,
    targetType: "user",
  });

  return {
    currentEmail: current.email,
    pendingEmail: data.newEmail,
    status: "verification_required",
  };
}

/** The change already happened, so a mailer outage must not fail the confirmation. */
async function notifyPreviousAddress(input: {
  dateFormat: string;
  newEmail: string;
  previousEmail: string;
}) {
  try {
    const preference = (DATE_FORMAT_PREFERENCES as readonly string[]).includes(input.dateFormat)
      ? (input.dateFormat as DateFormatPreference)
      : "auto";
    await sendEmailChangedNotice({
      ...input,
      changedAt: new Date(),
      dateFormat: resolveDateFormat(preference),
    });
  } catch (error: unknown) {
    console.error("[account] email change notice could not be sent", error);
  }
}

export async function confirmAccountEmailChange(input: unknown): Promise<AccountEmailChanged> {
  const session = await requireSession();
  const data = confirmAccountEmailChangeSchema.parse(input);
  const current = await accountEmailContext(session.user.id);

  if (sameEmail(current.email, data.newEmail)) {
    throw new Error("Enter a different email address.");
  }

  // Other sessions are revoked by the `user.update.before` auth hook, which Better Auth runs
  // after the code has been verified and consumed and before the address is written. A wrong
  // code therefore never touches sessions, and a revocation failure aborts the change. The
  // count is taken here for the audit row; the sweep below only catches a hook that did not run.
  const revokedSessionCount = await countOtherSessions(session);

  try {
    await auth.api.changeEmailEmailOTP({
      body: { newEmail: data.newEmail, otp: data.code },
      headers: await headers(),
    });
  } catch {
    throw new Error("The verification code is invalid or expired, or the email is unavailable.");
  }

  const updated = await accountEmailContext(session.user.id);
  if (!sameEmail(updated.email, data.newEmail) || !updated.emailVerified) {
    throw new Error("Email change could not be confirmed.");
  }

  const survivors = await revokeOtherSessions(session);
  if (survivors > 0) {
    console.error("[account] sessions survived the email change hook", { survivors });
  }

  revalidateAccountEmailViews();
  await notifyPreviousAddress({
    dateFormat: current.dateFormat,
    newEmail: updated.email,
    previousEmail: current.email,
  });

  await writeAudit({
    action: "account.email_changed",
    actorId: session.user.id,
    after: { email: updated.email, revokedSessionCount },
    before: { email: current.email },
    targetId: current.publicId,
    targetType: "user",
  });

  return { email: updated.email, emailVerification: "verified", status: "changed" };
}

export async function requestCurrentAccountEmailVerification(
  input: unknown,
): Promise<CurrentAccountEmailVerificationRequested> {
  const session = await requireSession();
  const data = requestCurrentAccountEmailVerificationSchema.parse(input);
  const current = await accountEmailContext(session.user.id);
  requireCurrentEmail(current.email, data.email);
  if (current.emailVerified) {
    throw new Error("Email is already verified.");
  }

  try {
    await auth.api.sendVerificationOTP({
      body: { email: data.email, type: "email-verification" },
      headers: await headers(),
    });
  } catch {
    throw new Error("Verification code could not be sent.");
  }

  await writeAudit({
    action: "account.email_verification_requested",
    actorId: session.user.id,
    after: { email: data.email },
    targetId: current.publicId,
    targetType: "user",
  });

  return { email: data.email, status: "verification_required" };
}

export async function confirmCurrentAccountEmailVerification(
  input: unknown,
): Promise<CurrentAccountEmailVerified> {
  const session = await requireSession();
  const data = confirmCurrentAccountEmailVerificationSchema.parse(input);
  const current = await accountEmailContext(session.user.id);
  requireCurrentEmail(current.email, data.email);
  if (current.emailVerified) {
    throw new Error("Email is already verified.");
  }

  let verifiedUserId: string;
  try {
    const response = await auth.api.verifyEmailOTP({
      body: { email: data.email, otp: data.code },
      headers: await headers(),
    });
    verifiedUserId = response.user.id;
  } catch {
    throw new Error("The verification code is invalid or expired.");
  }

  if (verifiedUserId !== session.user.id) {
    throw new Error("Email verification could not be confirmed.");
  }
  const updated = await accountEmailContext(session.user.id);
  if (!sameEmail(updated.email, data.email) || !updated.emailVerified) {
    throw new Error("Email verification could not be confirmed.");
  }

  await writeAudit({
    action: "account.email_verified",
    actorId: session.user.id,
    after: { email: updated.email, emailVerified: true },
    before: { email: current.email, emailVerified: false },
    targetId: current.publicId,
    targetType: "user",
  });

  revalidateAccountEmailViews();
  return { email: updated.email, emailVerification: "verified", status: "verified" };
}
