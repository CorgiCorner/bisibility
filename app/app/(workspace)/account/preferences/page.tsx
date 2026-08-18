import { AccountShell } from "@/components/account/AccountShell";
import { PreferencesForm } from "@/components/account/PreferencesForm";
import { getPreferences } from "@/lib/queries/account";
import { updatePreferences } from "./actions";

export default async function PreferencesPage() {
  const defaults = await getPreferences();

  return (
    <AccountShell activeSection="preferences">
      <div className="flex flex-col gap-5.5">
        <PreferencesForm defaults={defaults} updatePreferences={updatePreferences} />
      </div>
    </AccountShell>
  );
}
