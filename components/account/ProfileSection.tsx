"use client";

import { IdChip } from "@/components/ui/IdChip";
import { updateProfileName } from "@/lib/actions/account";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { cn } from "@/lib/ui/cn";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AccountSection } from "./AccountSection";
import { AvatarField } from "./AvatarField";
import {
  accentButtonClass,
  feedbackClass,
  fieldInputClass,
  fieldLabelClass,
  fieldValueClass,
} from "./account-ui";
import { useAccountActionError } from "./useAccountActionError";

type ProfileForm = { name: string };

export type ProfileSectionProps = {
  email: string;
  emailVerified: boolean;
  image: string | null;
  name: string;
  publicId: string;
  /** Deprecated: the form now calls the `updateProfileName` server action directly. */
  updateProfile?: (input: ProfileForm) => Promise<{ name: string }>;
};

export function ProfileSection({
  email,
  emailVerified,
  image,
  name,
  publicId,
}: Readonly<ProfileSectionProps>) {
  const router = useRouter();
  const t = useTranslations("account.profile");
  const accountErrors = useAccountActionError();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<ProfileForm>({
    defaultValues: { name },
    mode: "onChange",
    resolver: zodResolver(
      z.object({
        name: z.string().trim().min(1, t("nameRequired")).max(120, t("nameTooLong")),
      }),
    ),
  });

  function onSubmit(values: ProfileForm) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await updateProfileName(values);
        reset({ name: result.name });
        setMessage(t("saved"));
        router.refresh();
      } catch (error: unknown) {
        setMessage(accountErrors.generic(error, t("saveError")));
      }
    });
  }

  return (
    <AccountSection
      action={
        <button
          className={accentButtonClass}
          disabled={isPending}
          form="account-profile-form"
          type="submit"
        >
          {isPending ? t("saving") : t("save")}
        </button>
      }
      description={t("description")}
      title={t("title")}
    >
      <AvatarField email={email} image={image} name={name} />
      <form
        className="mt-4.5 grid gap-3.5 sm:grid-cols-2"
        id="account-profile-form"
        onSubmit={handleSubmit(onSubmit)}
      >
        <label className={fieldLabelClass}>
          {t("displayName")}
          <input className={fieldInputClass} {...register("name")} />
          {errors.name ? (
            <span className={cn(feedbackClass, "text-red-text")}>{errors.name.message}</span>
          ) : null}
        </label>
        <div className={fieldLabelClass}>
          <span className="flex flex-wrap items-center gap-2">
            {t("email")}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-[7px] py-px text-[9px] font-semibold tracking-[0.3px]",
                emailVerified ? "bg-green/10 text-green-text" : "bg-yellow/15 text-yellow-text",
              )}
            >
              <CheckCircle size={11} weight="regular" />
              {emailVerified ? t("verified") : t("unverified")}
            </span>
          </span>
          <span className={cn(fieldValueClass, "font-sans tabular-nums")}>{email}</span>
        </div>
        <div className={cn(fieldLabelClass, "sm:col-span-2 sm:max-w-[50%]")}>
          {t("userId")}
          <IdChip
            className="flex min-h-10 justify-between bg-transparent px-3 normal-case tracking-normal text-fg"
            copyLabel={t("copyUserId")}
            size="xs"
            value={publicId}
          />
        </div>
      </form>
      {message ? (
        <span className={cn(feedbackClass, "mt-3 block text-fg-muted")}>{message}</span>
      ) : null}
    </AccountSection>
  );
}
