import { EMAIL_SIGN_IN_UNAVAILABLE_MESSAGE } from "@/lib/auth/email-sign-in-availability";
import { DOCS_URL, docsLinkProps } from "@/lib/site/site";

export function EmailSignInUnavailable() {
  return (
    <div className="rounded-card border border-yellow bg-[color-mix(in_srgb,var(--yellow)_8%,transparent)] p-4">
      <h2 className="m-0 text-base font-semibold text-fg">Email sign-in unavailable</h2>
      <p className="mt-2 mb-0 text-[13px] leading-relaxed text-fg-muted">
        {EMAIL_SIGN_IN_UNAVAILABLE_MESSAGE}
      </p>
      <a
        className="mt-3 inline-flex text-[13px] font-semibold text-accent-text hover:underline"
        {...docsLinkProps(`${DOCS_URL}/self-hosting/email`)}
      >
        Configure email delivery
      </a>
    </div>
  );
}
