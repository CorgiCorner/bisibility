"use client";

import { useRef, useState } from "react";
import type { BusinessCommandPort, BusinessCommandResult } from "./contracts";
export type CommandWithoutKey<C> = C extends unknown ? Omit<C, "idempotencyKey"> : never;

/** UI lifecycle only. Actual scope/authz/CAS/idempotency remain in the server store. */
export function useBusinessCommand<C extends { idempotencyKey: string }, T>(
  port: BusinessCommandPort<C, T>,
  withKey: (command: CommandWithoutKey<C>, idempotencyKey: string) => C,
) {
  const [result, setResult] = useState<BusinessCommandResult<T> | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  async function submit(command: CommandWithoutKey<C>): Promise<BusinessCommandResult<T> | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setPending(true);
    setResult(null);
    let outcome: BusinessCommandResult<T>;
    try {
      const signature = JSON.stringify(command);
      if (retry.current?.signature !== signature)
        retry.current = { signature, key: crypto.randomUUID() };
      outcome = await port(withKey(command, retry.current.key));
    } catch {
      outcome = { kind: "error" };
    }
    setResult(outcome);
    setPending(false);
    inFlight.current = false;
    return outcome;
  }
  return { result, pending, submit, clearResult: () => setResult(null) };
}
