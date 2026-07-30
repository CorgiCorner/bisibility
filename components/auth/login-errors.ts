import { EMAIL_CAPACITY_EXHAUSTED } from "@/lib/auth/signin-capacity-types";

export function authErrorMessage(error: unknown) {
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
