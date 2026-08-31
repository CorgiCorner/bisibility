import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

const verifiedLoginCodeRequest = new AsyncLocalStorage<boolean>();

export function isVerifiedLoginCodeRequest() {
  return verifiedLoginCodeRequest.getStore() === true;
}

export function withVerifiedLoginCodeRequest<T>(callback: () => T): T {
  return verifiedLoginCodeRequest.run(true, callback);
}
