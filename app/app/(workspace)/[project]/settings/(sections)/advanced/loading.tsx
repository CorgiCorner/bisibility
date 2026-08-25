import { AdvancedSettingsLoading } from "@/components/settings/advanced/AdvancedSettingsLoading";
import { deploymentMode } from "@/lib/deployment/deployment";

export default function Loading() {
  return <AdvancedSettingsLoading deployment={deploymentMode()} />;
}
