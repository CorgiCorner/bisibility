import { AccountEmailCard } from "@/components/account/AccountEmailCard";
import { AccountPrivacyChoices } from "@/components/account/AccountPrivacyChoices";
import { AccountShell } from "@/components/account/AccountShell";
import { ConnectedAccounts } from "@/components/account/ConnectedAccounts";
import { DeleteAccount } from "@/components/account/DeleteAccount";
import { DemoAccountNotice } from "@/components/account/DemoAccountNotice";
import { ProfileSection } from "@/components/account/ProfileSection";
import {
  confirmAccountEmailChange,
  confirmCurrentAccountEmailVerification,
  requestAccountEmailChange,
  requestAccountEmailChangeCode,
  requestCurrentAccountEmailVerification,
} from "@/lib/actions/account-email";
import { ENABLED_SOCIAL_PROVIDERS } from "@/lib/auth/runtime-config";
import { requireSession } from "@/lib/auth/session";
import { resolveDemoAccountView } from "@/lib/demo/account-view";
import { getAccount } from "@/lib/queries/account";
import { deleteAccount, updateProfile } from "./actions";

export default async function AccountPage() {
  const session = await requireSession();
  if ((await resolveDemoAccountView(session.user.id)) === "locked") {
    return <DemoAccountNotice section="profile" />;
  }
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
          requestAccountEmailChangeCode={requestAccountEmailChangeCode}
          requestCurrentAccountEmailVerification={requestCurrentAccountEmailVerification}
        />
        <ConnectedAccounts
          accounts={account.connectedAccounts}
          configuredProviders={ENABLED_SOCIAL_PROVIDERS}
        />
        <AccountPrivacyChoices />
        <DeleteAccount deleteAccount={deleteAccount} email={account.email} />
      </div>
    </AccountShell>
  );
}
