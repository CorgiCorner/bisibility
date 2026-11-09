import type { CapacityFailure } from "./action";

type Notice = CapacityFailure["capacityFailure"];
let notice: Notice | null = null;
const listeners = new Set<() => void>();
export const capacityNoticeSnapshot = () => notice;
export const capacityNoticeServerSnapshot = () => null;
export function subscribeCapacityNotice(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function publishCapacityNotice(value: Notice | null) {
  if (typeof window === "undefined") return;
  notice = value;
  for (const listener of listeners) listener();
}

export function publishCapacityProblem(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const problem = value as { code?: string; detail?: string; details?: Notice["details"] };
  if (problem.code !== "plan_limit_reached" && problem.code !== "subscription_required")
    return false;
  publishCapacityNotice({
    code: problem.code,
    message: problem.detail ?? "",
    details: problem.details,
  });
  return true;
}
