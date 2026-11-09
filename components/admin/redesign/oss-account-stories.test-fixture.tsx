import type { AdminAccountView } from "@/lib/ops/admin-account-view";
import { type Story, sampleData } from "./oss-story-fixtures-1";
import { account, adminProps } from "./oss-story-fixtures-2";
import { requireFixture } from "./require-fixture";

export const manyAccounts: AdminAccountView[] = Array.from({ length: 27 }, (_, index) => ({
  ...account,
  id: `public-${index + 1}`,
  email: `user${String(index + 1).padStart(2, "0")}@example.com`,
  status: index === 26 ? "deactivated" : "active",
  created: `2026-10-${String(index + 1).padStart(2, "0")}`,
  lastActive: `2026-11-${String(27 - index).padStart(2, "0")}`,
  projects: index + 1,
}));
const listStory = (overrides: Partial<typeof adminProps>): Story => ({
  args: {
    initialTab: "Users",
    initialView: "Accounts",
    data: {
      ...sampleData,
      administration: { ...adminProps, account: null, accounts: manyAccounts, ...overrides },
    },
  },
});
export const ManyAccounts = listStory({});
export const EmptyAccounts = listStory({ accounts: [] });
export const LoadingAccounts = listStory({ accountsState: "loading" });
export const UnavailableAccounts = listStory({ accountsState: "unavailable" });
export const DeactivatedAccount = listStory({ accounts: [requireFixture(manyAccounts[26])] });
