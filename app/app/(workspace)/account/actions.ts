"use server";

import {
  deleteAccount as deleteAccountAction,
  revokeSession as revokeSessionAction,
  signOutEverywhere as signOutEverywhereAction,
  updateProfileName,
} from "@/lib/actions/account";

// Next 15 requires every export of a "use server" file to be an async
// function, so these are thin wrappers instead of `export { ... } from`.
export async function updateProfile(input: unknown) {
  return updateProfileName(input);
}

export async function signOutEverywhere() {
  return signOutEverywhereAction();
}

export async function revokeSession(input: unknown) {
  return revokeSessionAction(input);
}

export async function deleteAccount(input: unknown) {
  return deleteAccountAction(input);
}
