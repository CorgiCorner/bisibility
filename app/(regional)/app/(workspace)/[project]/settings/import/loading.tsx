import { CloudImportSettingsLoading } from "@/components/cloud/CloudImportLoading";
import { PageContent } from "@/components/shell/PageContent";

export default function SettingsImportLoading() {
  return (
    <PageContent aria-hidden variant="form">
      <CloudImportSettingsLoading />
    </PageContent>
  );
}
