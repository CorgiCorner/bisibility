import { Button, Card } from "@/components/ui";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

type AccountStatusCardProps = {
  administratorExists: boolean;
  recoveryAction?: ReactNode;
  switchAccountAction: () => Promise<void>;
};

function AccountSwitchForm({
  action,
}: Readonly<{ action: AccountStatusCardProps["switchAccountAction"] }>) {
  return (
    <form action={action} className="flex-1">
      <Button
        aria-label="Sign out and switch account"
        className="w-full"
        size="lg"
        type="submit"
        variant="secondary"
      >
        Switch account
      </Button>
    </form>
  );
}

export function SetupAccountStatusCard(props: Readonly<AccountStatusCardProps>) {
  const { administratorExists, switchAccountAction } = props;

  return (
    <Card className="flex flex-col gap-[18px] p-7" size="lg">
      <div className="flex items-start gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-hover">
          <ShieldCheck aria-hidden size={22} weight="fill" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[20px] font-bold tracking-[-0.02em]">
            {administratorExists ? "Setup is complete" : "Finish administrator setup"}
          </h1>
          <p className="m-0 text-[13.5px] leading-[1.55] text-fg-muted">
            {administratorExists
              ? "This instance already has an administrator. If you need admin access, ask them - or a server operator can reassign the role from the command line."
              : "This instance does not have an administrator. Your signed-in account can complete setup now."}
          </p>
        </div>
      </div>
      <div className="flex gap-2.5">
        {administratorExists ? (
          <Button className="flex-1" component={Link} href="/app" size="lg">
            Go to the app
          </Button>
        ) : (
          (props.recoveryAction ?? null)
        )}
        <AccountSwitchForm action={switchAccountAction} />
      </div>
    </Card>
  );
}
