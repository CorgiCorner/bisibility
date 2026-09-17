"use server";

import { auth } from "@/lib/auth/auth";
import { isFirstRun } from "@/lib/auth/first-run";
import { promoteFirstRunAdministrator } from "@/lib/auth/first-run-account";
import { type SetupFormValues, setupAccountSchema } from "@/lib/auth/first-run-schema";
import { getAuditRequestContext } from "@/lib/auth/request-context";
import { requireSession } from "@/lib/auth/session";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type SetupActionResult =
  | {
      code:
        | "ALREADY_COMPLETED"
        | "EXPIRED_CODE"
        | "INVALID_EMAIL"
        | "INVALID_NAME_LONG"
        | "INVALID_NAME_REQUIRED"
        | "INVALID_OTP"
        | "REQUEST_CODE_FAILED"
        | "SETUP_FAILED";
      status: "error";
      field?: "email" | "name" | "otp";
    }
  | { status: "complete" | "ready" };

function firstIssue(issues: readonly { code: string; path: PropertyKey[] }[]): SetupActionResult {
  const issue = issues[0];
  const field = issue?.path[0];
  const fieldName = field === "email" || field === "name" || field === "otp" ? field : undefined;
  const code =
    fieldName === "email"
      ? "INVALID_EMAIL"
      : fieldName === "otp"
        ? "INVALID_OTP"
        : issue?.code === "too_big"
          ? "INVALID_NAME_LONG"
          : "INVALID_NAME_REQUIRED";
  return {
    code,
    field: fieldName,
    status: "error",
  };
}

function completedError(): SetupActionResult {
  return {
    code: "ALREADY_COMPLETED",
    status: "error",
  };
}

async function signOutCurrentSession() {
  await auth.api.signOut({ headers: await headers() });
}

export async function requestSetupCodeAction(values: SetupFormValues): Promise<SetupActionResult> {
  if (!(await isFirstRun())) {
    return completedError();
  }

  const parsed = setupAccountSchema.safeParse(values);
  if (!parsed.success) {
    return firstIssue(parsed.error.issues);
  }

  try {
    await auth.api.sendVerificationOTP({
      body: { email: parsed.data.email, type: "sign-in" },
    });
  } catch {
    return {
      code: "REQUEST_CODE_FAILED",
      field: "email",
      status: "error",
    };
  }

  return { status: "ready" };
}

export async function completeSetupAction(): Promise<SetupActionResult> {
  const session = await requireSession();
  let result: Awaited<ReturnType<typeof promoteFirstRunAdministrator>>;
  try {
    result = await promoteFirstRunAdministrator(
      session.user.id,
      session.user.email,
      await getAuditRequestContext(),
    );
  } catch {
    return {
      code: "SETUP_FAILED",
      field: "otp",
      status: "error",
    };
  }

  if (result === "administrator_exists") {
    await signOutCurrentSession();
    return completedError();
  }

  if (result === "retry") {
    return {
      code: "SETUP_FAILED",
      field: "otp",
      status: "error",
    };
  }

  return { status: "complete" };
}

export async function signOutAndSwitchAccountAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
