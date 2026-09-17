import { createHash } from "node:crypto";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { InviteSignInForm } from "@/components/invite/InviteSignInForm";
import { InviteSignOutButton } from "@/components/invite/InviteSignOutButton";
import { BrandLockup } from "@/components/ui/BrandLockup";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveAnonymousDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { acceptInvite } from "@/lib/actions/team";
import { getSession } from "@/lib/auth/session";
import { type DateFormat, formatDisplayDate } from "@/lib/dates/format";
import { resolveDateFormat } from "@/lib/dates/resolve";
import { getInviteByTokenHash } from "@/lib/queries/invite";
import { appPath } from "@/lib/routing/app-path";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { ClockCountdownIcon as ClockCountdown } from "@phosphor-icons/react/dist/ssr/ClockCountdown";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import type { Metadata } from "next";
import { headers } from "next/headers";
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

export async function generateMetadata(): Promise<Metadata> {
  const runtime = await resolveAnonymousDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["invite"]);
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  return createNoindexMetadata({
    description: t("invite.metadataDescription"),
    title: t("invite.teamInvite"),
  });
}

export const dynamic = "force-dynamic";

function hashInviteToken(raw: string) {
  return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
}

function isInviteRole(role: string): role is "admin" | "member" | "viewer" {
  return role === "admin" || role === "member" || role === "viewer";
}

async function getInviteState(
  token: string,
  roleLabel: (role: "admin" | "member" | "viewer") => string,
): Promise<InviteState> {
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
    roleLabel: roleLabel(invite.role),
    status: "valid",
  };
}

function formatInviteDate(date: Date, dateFormat: DateFormat, locale: string, timeZone: string) {
  return formatDisplayDate(date.toISOString().slice(0, 10), { dateFormat, locale, timeZone });
}

function Shell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-5 py-10 text-fg">
      <div className="w-full max-w-[470px] rounded-card border border-border bg-bg-elev p-6">
        <Link className="inline-flex w-fit no-underline" href="/">
          <BrandLockup />
        </Link>
        {children}
      </div>
    </main>
  );
}

function InvalidInvite({
  body,
  signInLabel,
  title,
}: Readonly<{ body: string; signInLabel: string; title: string }>) {
  return (
    <Shell>
      <div className="mt-8">
        <span className="grid h-12 w-12 place-items-center rounded-card bg-red/10 text-red-text">
          <WarningCircle aria-hidden size={24} weight="regular" />
        </span>
        <h1 className="mt-4 mb-0 text-[24px] font-semibold leading-tight">{title}</h1>
        <p className="mt-2 mb-0 text-[14px] leading-relaxed text-fg-muted">{body}</p>
        <Link
          className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-control border border-border-control bg-bg-elev px-4 text-[13px] font-semibold text-fg hover:border-accent hover:text-accent-text"
          href="/login"
        >
          {signInLabel}
        </Link>
      </div>
    </Shell>
  );
}

export default async function InvitePage({ params }: Readonly<InvitePageProps>) {
  const { token } = await params;
  const runtime = await resolveAnonymousDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["invite"]);
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  const roleLabel = (role: "admin" | "member" | "viewer") => {
    if (role === "admin") return t("invite.roles.admin");
    if (role === "member") return t("invite.roles.member");
    return t("invite.roles.viewer");
  };
  const invite = await getInviteState(token, roleLabel);
  if (invite.status !== "valid") {
    const copy =
      invite.status === "expired"
        ? { body: t("invite.expiredBody"), title: t("invite.expired") }
        : invite.status === "used"
          ? { body: t("invite.alreadyUsedBody"), title: t("invite.alreadyUsed") }
          : { body: t("invite.invalidBody"), title: t("invite.invalid") };
    return (
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        <InvalidInvite {...copy} signInLabel={t("invite.goToSignIn")} />
      </FeatureMessagesProvider>
    );
  }

  const requestHeaders = await headers();
  const dateFormat = resolveDateFormat("auto", requestHeaders.get("accept-language"));

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
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-control bg-accent-solid px-4 text-[13px] font-semibold text-accent-on-solid hover:opacity-90"
          type="submit"
        >
          {t("invite.accept")} <CaretRight aria-hidden size={15} weight="regular" />
        </button>
      </form>
    );
  } else if (session) {
    inviteAction = (
      <div className="mt-5 rounded-card border border-red bg-bg-sunken p-4">
        <p className="m-0 text-[13px] leading-relaxed text-fg-muted">
          {t("invite.mismatchedAccount", {
            current: session.user.email,
            invited: invite.email,
          })}
        </p>
        <div className="mt-3">
          <InviteSignOutButton returnTo={returnTo} />
        </div>
      </div>
    );
  }

  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <Shell>
        <div className="mt-8">
          <span className="grid h-12 w-12 place-items-center rounded-card bg-accent-soft text-accent-solid">
            <CheckCircle aria-hidden size={24} weight="regular" />
          </span>
          <p className="mt-5 mb-0 text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            {t("invite.teamInvite")}
          </p>
          <h1 className="mt-2 mb-0 text-[25px] font-semibold leading-tight">
            {t("invite.join", { project: invite.projectName })}
          </h1>
          <div className="mt-4 grid gap-2 rounded-card border border-border bg-bg-sunken p-4">
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-fg-muted">{t("invite.role")}</span>
              <span className="font-semibold text-fg">{invite.roleLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-fg-muted">{t("invite.invitedEmail")}</span>
              <span className="truncate text-fg">{invite.email}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <span className="inline-flex items-center gap-1.5 text-fg-muted">
                <ClockCountdown aria-hidden size={14} weight="regular" />
                {t("invite.expires")}
              </span>
              <span className="font-medium text-fg">
                {formatInviteDate(invite.expiresAt, dateFormat, runtime.locale, runtime.timeZone)}
              </span>
            </div>
          </div>

          {inviteAction}
        </div>
      </Shell>
    </FeatureMessagesProvider>
  );
}
