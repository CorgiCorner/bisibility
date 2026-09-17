import { Button } from "@/components/ui/Button";
import { MenuActionFooter } from "@/components/ui/MenuActionFooter";
import { useTranslations } from "next-intl";
import { propertyConnectionSettingsHref } from "./SearchInsightsPropertyPickerGrouping";

export function SearchInsightsPropertyPickerFooter({ projectId }: { projectId: string }) {
  const t = useTranslations("projectSearchInsights.copy");
  return (
    <MenuActionFooter>
      <Button
        className="w-full"
        href={propertyConnectionSettingsHref(projectId)}
        size="xs"
        variant="secondary"
      >
        {t("manageConnection")}
      </Button>
    </MenuActionFooter>
  );
}
