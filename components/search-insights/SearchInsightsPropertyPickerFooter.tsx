import { Button } from "@/components/ui/Button";
import { MenuActionFooter } from "@/components/ui/MenuActionFooter";
import { propertyConnectionSettingsHref } from "./SearchInsightsPropertyPickerGrouping";

export function SearchInsightsPropertyPickerFooter({ projectId }: { projectId: string }) {
  return (
    <MenuActionFooter>
      <Button
        className="w-full"
        href={propertyConnectionSettingsHref(projectId)}
        size="xs"
        variant="secondary"
      >
        Manage connection
      </Button>
    </MenuActionFooter>
  );
}
