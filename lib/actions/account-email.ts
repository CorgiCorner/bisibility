"use server";

import {
  confirmAccountEmailChangeSchema,
  confirmCurrentAccountEmailVerificationSchema,
  requestAccountEmailChangeSchema,
  requestCurrentAccountEmailVerificationSchema,
} from "@/lib/auth/account-email-change-schema";
import { writeAudit } from "@/lib/auth/audit";
import { auth } from "@/lib/auth/auth";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { appPath, appRootPath, asProjectRef } from "@/lib/routing/app-path";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

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
    select: { email: true, emailVerified: true, publicId: true },
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
      body: { newEmail: data.newEmail },
      headers: await headers(),
    });
  } catch {
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

export async function confirmAccountEmailChange(input: unknown): Promise<AccountEmailChanged> {
  const session = await requireSession();
  const data = confirmAccountEmailChangeSchema.parse(input);
  const current = await accountEmailContext(session.user.id);

  if (sameEmail(current.email, data.newEmail)) {
    throw new Error("Enter a different email address.");
  }

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

  await writeAudit({
    action: "account.email_changed",
    actorId: session.user.id,
    after: { email: updated.email },
    before: { email: current.email },
    targetId: current.publicId,
    targetType: "user",
  });

  revalidateAccountEmailViews();
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
