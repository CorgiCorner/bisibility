import { AccountShell } from "@/components/account/AccountShell";
import { PreferencesForm } from "@/components/account/PreferencesForm";
import { resolveDateFormat } from "@/lib/dates/resolve";
import { getPreferences } from "@/lib/queries/account";
import { dateKey } from "@/lib/search-insights/dates";
import { headers } from "next/headers";
import { updatePreferences } from "./actions";

export default async function PreferencesPage() {
  const [defaults, headerStore] = await Promise.all([getPreferences(), headers()]);
  const todayKey = dateKey(new Date());
  const autoExample = resolveDateFormat("auto", headerStore.get("accept-language"));

  return (
    <AccountShell activeSection="preferences">
      <div className="flex flex-col gap-5.5">
        <PreferencesForm
          autoExample={autoExample}
          defaults={defaults}
          todayKey={todayKey}
          updatePreferences={updatePreferences}
        />
      </div>
    </AccountShell>
  );
}
