import type { IntegrationProviderData } from "@/lib/integrations/types";

export function ProviderCredentialWarning({
  credentialIssue,
}: Pick<IntegrationProviderData, "credentialIssue">) {
  if (credentialIssue !== "unreadable") return null;

  return (
    <p
      className="m-0 mt-3 rounded-lg border border-red bg-red/5 px-3 py-2 text-[12.5px] leading-[1.45] text-red sm:col-span-2"
      role="alert"
    >
      <strong className="font-semibold">Stored credentials can't be read.</strong> Reconnect the
      provider.
    </p>
  );
}
