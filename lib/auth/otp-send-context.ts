import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

type OtpSendState = {
  firstRunFallback: boolean;
  sendCounterReserved: boolean;
};

const otpSendStorage = new AsyncLocalStorage<OtpSendState>();

export function otpSendState() {
  return otpSendStorage.getStore() ?? null;
}

export function withOtpSendState<T>(state: OtpSendState, callback: () => Promise<T>): Promise<T> {
  return otpSendStorage.run(state, callback);
}
