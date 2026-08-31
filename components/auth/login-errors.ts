import { EMAIL_SIGN_IN_UNAVAILABLE_MESSAGE } from "@/lib/auth/email-sign-in-availability";
import { EMAIL_CAPACITY_EXHAUSTED } from "@/lib/auth/signin-capacity-types";

function errorCodes(error: unknown) {
  if (!error || typeof error !== "object") return [];
  const typed = error as { body?: { code?: unknown }; code?: unknown; message?: unknown };
  return [typed.code, typed.message, typed.body?.code];
}

export function authErrorMessage(error: unknown) {
  if (errorCodes(error).some((value) => value === "EMAIL_NOT_CONFIGURED")) {
    return EMAIL_SIGN_IN_UNAVAILABLE_MESSAGE;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Something went wrong. Try again.";
}

export function isEmailCapacityError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const typed = error as { code?: unknown; message?: unknown };
  return [typed.code, typed.message].some(
    (value) => typeof value === "string" && value.toLowerCase() === EMAIL_CAPACITY_EXHAUSTED,
  );
}
