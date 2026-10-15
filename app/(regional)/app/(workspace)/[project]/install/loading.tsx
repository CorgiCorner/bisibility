import { InstallPageLoading } from "@/components/install/InstallPageLoading";
import { isCloud } from "@/lib/deployment/deployment";
export default function InstallLoading() {
  return <InstallPageLoading isCloudHosted={isCloud} />;
}
