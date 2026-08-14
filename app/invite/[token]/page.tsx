import { createHash } from "node:crypto";
import { InviteSignInForm } from "@/components/invite/InviteSignInForm";
import { InviteSignOutButton } from "@/components/invite/InviteSignOutButton";
import { BrandLockup } from "@/components/ui";
import { acceptInvite } from "@/lib/actions/team";
import { getSession } from "@/lib/auth/session";
import { getInviteByTokenHash } from "@/lib/queries/invite";
import { appPath } from "@/lib/routing/app-path";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import {
  CaretRightIcon as CaretRight,
  CheckCircleIcon as CheckCircle,
  ClockCountdownIcon as ClockCountdown,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

type InviteStatus = "expired" | "invalid" | "used";
type InviteState =
  | { status: InviteStatus }
  | {
      email: string;
      expiresAt: Date;
      projectName: string;
      roleLabel: string;
      status: "valid";
    };

const roleLabels = {
  admin: "Admin",
  member: "Editor",
  viewer: "Viewer",
} as const;

const invalidInviteCopy = {
  expired: {
    body: "Ask a project admin to send a fresh invite.",
    title: "This invite has expired",
  },
  invalid: {
    body: "Check the link or ask the sender to resend the invite.",
    title: "Invite not found",
  },
  used: {
    body: "The invite has already been accepted or replaced by a newer one.",
    title: "This invite was already used",
  },
} satisfies Record<InviteStatus, { body: string; title: string }>;

export const metadata: Metadata = createNoindexMetadata({
  title: "Team invite | bisibility",
  description: "Accept a bisibility project invitation.",
});

export const dynamic = "force-dynamic";

function hashInviteToken(raw: string) {
  return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
}

function isInviteRole(role: string): role is keyof typeof roleLabels {
  return role in roleLabels;
}

async function getInviteState(token: string): Promise<InviteState> {
  const rawToken = token.trim();
  if (rawToken.length < 20 || rawToken.length > 256) return { status: "invalid" };

  const invite = await getInviteByTokenHash(hashInviteToken(rawToken));
  if (!invite) return { status: "invalid" };
  if (invite.acceptedAt) return { status: "used" };
  if (invite.expiresAt <= new Date()) return { status: "expired" };
  if (!isInviteRole(invite.role)) return { status: "invalid" };

  return {
    email: invite.email,
    expiresAt: invite.expiresAt,
    projectName: invite.project.name,
    roleLabel: roleLabels[invite.role],
    status: "valid",
  };
}

function formatInviteDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function Shell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-5 py-10 text-fg">
      <div className="w-full max-w-[470px] rounded-[16px] border border-border bg-bg-elev p-6">
        <Link className="inline-flex w-fit no-underline" href="/">
          <BrandLockup />
        </Link>
        {children}
      </div>
    </main>
  );
}

function InvalidInvite({ status }: Readonly<{ status: InviteStatus }>) {
  const copy = invalidInviteCopy[status];
  return (
    <Shell>
      <div className="mt-8">
        <span className="grid h-12 w-12 place-items-center rounded-[13px] bg-red/10 text-red-text">
          <WarningCircle aria-hidden size={24} weight="fill" />
        </span>
        <h1 className="mt-4 mb-0 text-[24px] font-semibold leading-tight">{copy.title}</h1>
        <p className="mt-2 mb-0 text-[14px] leading-relaxed text-fg-muted">{copy.body}</p>
        <Link
          className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-[9px] border border-border-strong bg-bg-elev px-4 text-[13px] font-semibold text-fg hover:border-accent hover:text-accent-text"
          href="/login"
        >
          Go to sign in
        </Link>
      </div>
    </Shell>
  );
}

export default async function InvitePage({ params }: Readonly<InvitePageProps>) {
  const { token } = await params;
  const invite = await getInviteState(token);
  if (invite.status !== "valid") return <InvalidInvite status={invite.status} />;

  const session = await getSession();
  const signedInEmail = session?.user.email.toLowerCase() ?? "";
  const invitedEmail = invite.email.toLowerCase();
  const canAccept = Boolean(session && signedInEmail === invitedEmail);
  const returnTo = `/invite/${encodeURIComponent(token)}`;

  async function acceptInviteAction() {
    "use server";
    const result = await acceptInvite({ token });
    redirect(appPath(result.publicId, "dashboard"));
  }

  let inviteAction = <InviteSignInForm email={invite.email} />;
  if (canAccept) {
    inviteAction = (
      <form action={acceptInviteAction} className="mt-5">
        <button
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[9px] bg-accent-solid px-4 text-[13px] font-semibold text-primary-contrast hover:opacity-90"
          type="submit"
        >
          Accept invite <CaretRight aria-hidden size={15} weight="bold" />
        </button>
      </form>
    );
  } else if (session) {
    inviteAction = (
      <div className="mt-5 rounded-[12px] border border-red bg-bg-sunken p-4">
        <p className="m-0 text-[13px] leading-relaxed text-fg-muted">
          You are signed in as <span className="font-mono text-fg">{session.user.email}</span>. Sign
          in as <span className="font-mono text-fg">{invite.email}</span> to accept this invite.
        </p>
        <div className="mt-3">
          <InviteSignOutButton returnTo={returnTo} />
        </div>
      </div>
    );
  }

  return (
    <Shell>
      <div className="mt-8">
        <span className="grid h-12 w-12 place-items-center rounded-[13px] bg-accent-soft text-accent-text">
          <CheckCircle aria-hidden size={24} weight="fill" />
        </span>
        <p className="mt-5 mb-0 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          Team invite
        </p>
        <h1 className="mt-2 mb-0 text-[25px] font-semibold leading-tight">
          Join {invite.projectName}
        </h1>
        <div className="mt-4 grid gap-2 rounded-[12px] border border-border bg-bg-sunken p-4">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-fg-muted">Role</span>
            <span className="font-semibold text-fg">{invite.roleLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-fg-muted">Invited email</span>
            <span className="truncate font-mono text-fg">{invite.email}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="inline-flex items-center gap-1.5 text-fg-muted">
              <ClockCountdown aria-hidden size={14} />
              Expires
            </span>
            <span className="font-medium text-fg">{formatInviteDate(invite.expiresAt)}</span>
          </div>
        </div>

        {inviteAction}
      </div>
    </Shell>
  );
}
