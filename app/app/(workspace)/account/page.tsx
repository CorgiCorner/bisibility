import { AccountPageHeader } from "@/components/account/AccountPageHeader";
import { ConnectedAccounts } from "@/components/account/ConnectedAccounts";
import { DeleteAccount } from "@/components/account/DeleteAccount";
import { ProfileSection } from "@/components/account/ProfileSection";
import { PageContent } from "@/components/shell/PageContent";
import { getAccount } from "@/lib/queries/account";
import { deleteAccount, updateProfile } from "./actions";

export default async function AccountPage() {
  const account = await getAccount();

  return (
    <PageContent className="flex flex-col gap-[22px]" variant="form">
      <AccountPageHeader active="/app/account" />
      <ProfileSection
        email={account.email}
        emailVerified={account.emailVerified}
        image={account.image}
        name={account.name}
        publicId={account.publicId}
        updateProfile={updateProfile}
      />
      <ConnectedAccounts accounts={account.connectedAccounts} />
      <DeleteAccount deleteAccount={deleteAccount} email={account.email} />
    </PageContent>
  );
}
