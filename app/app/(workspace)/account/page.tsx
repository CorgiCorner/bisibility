import { AccountEmailCard } from "@/components/account/AccountEmailCard";
import { AccountShell } from "@/components/account/AccountShell";
import { ConnectedAccounts } from "@/components/account/ConnectedAccounts";
import { DeleteAccount } from "@/components/account/DeleteAccount";
import { ProfileSection } from "@/components/account/ProfileSection";
import {
  confirmAccountEmailChange,
  confirmCurrentAccountEmailVerification,
  requestAccountEmailChange,
  requestCurrentAccountEmailVerification,
} from "@/lib/actions/account-email";
import { getAccount } from "@/lib/queries/account";
import { deleteAccount, updateProfile } from "./actions";

export default async function AccountPage() {
  const account = await getAccount();

  return (
    <AccountShell activeSection="profile">
      <div className="flex flex-col gap-5.5">
        <ProfileSection
          email={account.email}
          emailVerified={account.emailVerified}
          image={account.avatarUrl}
          name={account.name}
          publicId={account.publicId}
          updateProfile={updateProfile}
        />
        <AccountEmailCard
          key={`${account.email}:${account.emailVerified}`}
          confirmAccountEmailChange={confirmAccountEmailChange}
          confirmCurrentAccountEmailVerification={confirmCurrentAccountEmailVerification}
          email={account.email}
          emailVerified={account.emailVerified}
          requestAccountEmailChange={requestAccountEmailChange}
          requestCurrentAccountEmailVerification={requestCurrentAccountEmailVerification}
        />
        <ConnectedAccounts accounts={account.connectedAccounts} />
        <DeleteAccount deleteAccount={deleteAccount} email={account.email} />
      </div>
    </AccountShell>
  );
}
