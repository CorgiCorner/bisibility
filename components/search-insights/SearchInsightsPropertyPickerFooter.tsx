import { Button, MenuActionFooter } from "@/components/ui";
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
