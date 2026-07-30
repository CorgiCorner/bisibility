"use server";

import {
  type ActionFailure,
  type ActionResult,
  actionFailureResult,
} from "@/lib/actions/action-result";
import { auth } from "@/lib/auth/auth";
import { requireSession } from "@/lib/auth/session";
import {
  beginTwoFactorEnrollment,
  completeTwoFactorEnrollment,
  disableTwoFactor,
  enrollmentOperation,
  regenerateTwoFactorBackupCodes,
} from "@/lib/auth/two-factor-management";
import { getTwoFactorSecurityContext } from "@/lib/auth/two-factor-management-context";
import {
  TwoFactorManagementError,
  type TwoFactorManagementErrorCode,
} from "@/lib/auth/two-factor-management-error";
import {
  completeTwoFactorEnrollmentSchema,
  twoFactorManagementSchema,
} from "@/lib/auth/two-factor-management-schema";
import { authorizeTwoFactorOperation } from "@/lib/auth/two-factor-step-up";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";

type EnrollmentStarted = Awaited<ReturnType<typeof beginTwoFactorEnrollment>>;
type EnrollmentCompleted = Awaited<ReturnType<typeof completeTwoFactorEnrollment>>;
type BackupCodesRegenerated = Awaited<ReturnType<typeof regenerateTwoFactorBackupCodes>>;
type TwoFactorDisabled = Awaited<ReturnType<typeof disableTwoFactor>>;

const failureStatus: Record<TwoFactorManagementErrorCode, ActionFailure["status"]> = {
  enrollment_expired: 410,
  invalid_input: 400,
  rate_limited: 429,
  session_not_fresh: 403,
  step_up_failed: 401,
  step_up_locked: 429,
  unavailable: 503,
};

function failure(code: TwoFactorManagementErrorCode, message: string) {
  return actionFailureResult({
    code,
    message,
    status: failureStatus[code],
  } as ActionFailure);
}

function invalidInput(message = "Check the form and try again.") {
  return failure("invalid_input", message);
}

function managementFailure(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof TwoFactorManagementError) {
    return failure(error.code, error.message);
  }
  console.error("[two-factor] Management action failed.", error);
  return failure("unavailable", "Two-factor authentication is temporarily unavailable.");
}

async function securityContext() {
  return getTwoFactorSecurityContext(await requireSession());
}

export async function beginTwoFactorEnrollmentAction(
  input: unknown,
): Promise<ActionResult<EnrollmentStarted>> {
  try {
    const context = await securityContext();
    const parsed = twoFactorManagementSchema({
      factorRequired: context.twoFactorEnabled,
      passwordRequired: Boolean(context.credentialPasswordHash),
    }).safeParse(input);
    if (!parsed.success) {
      return invalidInput(parsed.error.issues[0]?.message);
    }

    const operation = enrollmentOperation(context);
    const grantId = await authorizeTwoFactorOperation(context, operation, parsed.data);
    return { ok: true, value: await beginTwoFactorEnrollment(context, grantId) };
  } catch (error) {
    return managementFailure(error);
  }
}

export async function completeTwoFactorEnrollmentAction(
  input: unknown,
): Promise<ActionResult<EnrollmentCompleted>> {
  const parsed = completeTwoFactorEnrollmentSchema.safeParse(input);
  if (!parsed.success) {
    return invalidInput(parsed.error.issues[0]?.message);
  }

  try {
    const context = await securityContext();
    return { ok: true, value: await completeTwoFactorEnrollment(context, parsed.data) };
  } catch (error) {
    return managementFailure(error);
  }
}

export async function regenerateTwoFactorBackupCodesAction(
  input: unknown,
): Promise<ActionResult<BackupCodesRegenerated>> {
  try {
    const context = await securityContext();
    if (!context.twoFactorEnabled) {
      return invalidInput("Two-factor authentication is not enabled.");
    }
    const parsed = twoFactorManagementSchema({
      factorRequired: true,
      passwordRequired: Boolean(context.credentialPasswordHash),
    }).safeParse(input);
    if (!parsed.success) {
      return invalidInput(parsed.error.issues[0]?.message);
    }

    const grantId = await authorizeTwoFactorOperation(context, "regenerate", parsed.data);
    return { ok: true, value: await regenerateTwoFactorBackupCodes(context, grantId) };
  } catch (error) {
    return managementFailure(error);
  }
}

export async function disableTwoFactorAction(
  input: unknown,
): Promise<ActionResult<TwoFactorDisabled>> {
  try {
    const context = await securityContext();
    if (!context.twoFactorEnabled) {
      return invalidInput("Two-factor authentication is not enabled.");
    }
    const parsed = twoFactorManagementSchema({
      factorRequired: true,
      passwordRequired: Boolean(context.credentialPasswordHash),
    }).safeParse(input);
    if (!parsed.success) {
      return invalidInput(parsed.error.issues[0]?.message);
    }

    const grantId = await authorizeTwoFactorOperation(context, "disable", parsed.data);
    const value = await disableTwoFactor(context, grantId);
    try {
      await auth.api.signOut({ headers: await headers() });
    } catch {
      console.error(
        "[two-factor] Account was secured but the session cookie could not be cleared.",
      );
    }
    return { ok: true, value };
  } catch (error) {
    return managementFailure(error);
  }
}
