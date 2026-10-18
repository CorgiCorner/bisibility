"use client";
import { createContext, type ReactNode, useContext } from "react";
import { accountSections } from "./account-sections";

const ActivityNavigation = createContext(false);
export function AccountNavigationProvider({
  activityEnabled,
  children,
}: {
  activityEnabled: boolean;
  children: ReactNode;
}) {
  return (
    <ActivityNavigation.Provider value={activityEnabled}>{children}</ActivityNavigation.Provider>
  );
}
export function useAccountSections() {
  const enabled = useContext(ActivityNavigation);
  return accountSections.filter((section) => section.id !== "activity" || enabled);
}
