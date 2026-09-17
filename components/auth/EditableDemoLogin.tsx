"use client";

import { ExploreDemo } from "@/components/auth/ExploreDemo";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function EditableDemoLogin({
  ownerSignInHref = "/login?owner=1&switch=1",
}: {
  ownerSignInHref?: string;
}) {
  const t = useTranslations("auth.demo");
  return (
    <div className="flex flex-col gap-5">
      <ExploreDemo />
      <p className="m-0 text-center text-sm text-fg-muted">
        {t("ownerPrompt")}{" "}
        <Link className="font-medium text-fg underline underline-offset-4" href={ownerSignInHref}>
          {t("ownerSignIn")}
        </Link>
      </p>
    </div>
  );
}
