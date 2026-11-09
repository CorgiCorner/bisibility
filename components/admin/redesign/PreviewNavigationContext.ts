import { createContext } from "react";

export type PreviewDestination =
  | "Subscriptions"
  | "Worker"
  | "Checks"
  | "Data sources"
  | "Tasks"
  | "Notifications"
  | "Sending today"
  | "Ledger"
  | "Accounting health";
export const PreviewNavigationContext = createContext<(destination: PreviewDestination) => void>(
  () => {},
);
