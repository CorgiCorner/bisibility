import "server-only";

import type { BetterAuthPlugin } from "better-auth";

export type TestAuthIdentity = { email: string; userId: string };

export async function readTestAuthIdentity(): Promise<TestAuthIdentity | null> {
  return null;
}
export async function assertTestAuthEmail(_email: string): Promise<boolean> {
  return false;
}
export async function assertTestAuthSession(_userId: string): Promise<void> {}
export async function assertTestAuthUserCreationAllowed(): Promise<void> {}
export async function suppressTestAuthEmail(_email: string, _type: string): Promise<boolean> {
  return false;
}
export function reviewLoginPlugin(): BetterAuthPlugin {
  return { id: "review-login" };
}
export function suppressReviewLoginEmail(_email: string, _type: string): boolean {
  return false;
}
