import { AccountPageHeader } from "@/components/account/AccountPageHeader";
import { PreferencesForm } from "@/components/account/PreferencesForm";
import { PageContent } from "@/components/shell/PageContent";
import { getPreferences } from "@/lib/queries/account";
import { updatePreferences } from "./actions";

export default async function PreferencesPage() {
  const defaults = await getPreferences();

  return (
    <PageContent className="flex flex-col gap-[22px]" variant="form">
      <AccountPageHeader active="/app/account/preferences" />
      <PreferencesForm defaults={defaults} updatePreferences={updatePreferences} />
    </PageContent>
  );
}
