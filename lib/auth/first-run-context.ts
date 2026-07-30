import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditRequestContext } from "@/lib/auth/request-context";

type PendingUser = {
  email: string;
  id: string;
};

type FirstRunCreationState = {
  pendingUser: PendingUser | null;
  requestContext: AuditRequestContext;
};

const firstRunCreationStorage = new AsyncLocalStorage<FirstRunCreationState>();

export function withFirstRunCreation<T>(
  requestContext: AuditRequestContext,
  callback: () => Promise<T>,
) {
  return firstRunCreationStorage.run({ pendingUser: null, requestContext }, callback);
}

export function firstRunCreationState() {
  return firstRunCreationStorage.getStore() ?? null;
}

export function isPendingFirstRunUser(userId: string) {
  return firstRunCreationState()?.pendingUser?.id === userId;
}

export function recordPendingFirstRunUser(user: PendingUser) {
  const state = firstRunCreationState();
  if (!state) {
    throw new Error("First-run account creation context is missing.");
  }
  state.pendingUser = user;
}
