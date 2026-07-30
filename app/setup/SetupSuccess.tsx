import { Button } from "@/components/ui";
import { appRootPath } from "@/lib/routing/app-path";
import {
  ArrowRightIcon as ArrowRight,
  CheckCircleIcon as CheckCircle,
  EnvelopeSimpleIcon as EnvelopeSimple,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export function SetupSuccess({ mailerConfigured }: Readonly<{ mailerConfigured: boolean }>) {
  return (
    <>
      <div className="flex flex-col items-center gap-3.5 px-0 pt-2 pb-0.5 text-center">
        <span className="grid h-[58px] w-[58px] place-items-center rounded-full bg-[#e8f0e4] text-[#2f7f50]">
          <CheckCircle aria-hidden size={32} weight="fill" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 text-[23px] font-bold tracking-[-0.02em]">
            You&apos;re the administrator
          </h1>
          <p className="m-0 text-[14px] leading-[1.55] text-fg-muted">
            Setup is complete. This instance is yours to run - connect a data provider next and add
            your first keywords.
          </p>
        </div>
      </div>
      <Button
        className="w-full"
        component={Link}
        endIcon={<ArrowRight size={15} weight="bold" />}
        href={appRootPath()}
        size="lg"
      >
        Go to your workspace
      </Button>
      <Link
        className="text-center text-[12.5px] font-medium text-fg-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
        href={appRootPath("admin")}
      >
        Open the admin panel
      </Link>
      <p className="m-0 text-center text-[12.5px] text-fg-muted">
        If you ever need to reassign administration, the server operator can do it from the command
        line.
      </p>
      {!mailerConfigured ? (
        <div className="flex items-start gap-2.5 rounded-[10px] border border-border bg-bg p-[11px_13px]">
          <EnvelopeSimple aria-hidden className="mt-px shrink-0 text-[#a06b2a]" size={16} />
          <p className="m-0 text-[12.5px] leading-[1.5] text-fg-muted">
            <strong className="font-semibold text-fg">Next: configure email delivery.</strong>{" "}
            Sign-in codes for other users need a working email provider - add one to your server
            configuration before inviting anyone.
          </p>
        </div>
      ) : null}
    </>
  );
}
