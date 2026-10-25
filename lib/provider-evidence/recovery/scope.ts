import { recoveryInstance } from "@/lib/metering/recovery/tokens";
import { meteringNamespace } from "@/lib/metering/runtime";
export function providerRecoveryScope() {
  return { namespace: meteringNamespace(), instanceId: recoveryInstance() };
}
