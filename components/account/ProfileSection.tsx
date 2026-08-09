"use client";

import { CopyButton, MonoText } from "@/components/ui";
import { updateProfileName } from "@/lib/actions/account";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
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

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120, "Name is too long."),
});

type ProfileForm = z.infer<typeof profileSchema>;

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
    resolver: zodResolver(profileSchema),
  });

  function onSubmit(values: ProfileForm) {
    setMessage(null);
    startTransition(() => {
      void updateProfileName(values)
        .then((result) => {
          reset({ name: result.name });
          setMessage("Profile saved.");
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Profile could not be saved.")),
        );
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
          {isPending ? "Saving" : "Save"}
        </button>
      }
      description="How you appear across bisibility. Email is your sign-in identity."
      title="Profile"
    >
      <AvatarField email={email} image={image} name={name} />
      <form
        className="mt-[18px] grid gap-[14px] sm:grid-cols-2"
        id="account-profile-form"
        onSubmit={handleSubmit(onSubmit)}
      >
        <label className={fieldLabelClass}>
          {"Display name "}
          <input className={fieldInputClass} {...register("name")} />
          {errors.name ? (
            <span className={cn(feedbackClass, "text-red-text")}>{errors.name.message}</span>
          ) : null}
        </label>
        <div className={fieldLabelClass}>
          <span className="flex flex-wrap items-center gap-2">
            {"Email "}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-[7px] py-px text-[9px] font-semibold tracking-[0.3px]",
                emailVerified ? "bg-green/10 text-green-text" : "bg-yellow/15 text-yellow-text",
              )}
            >
              <CheckCircle size={11} weight="fill" />
              {emailVerified ? "Verified via OTP" : "Unverified"}
            </span>
          </span>
          <span className={cn(fieldValueClass, "font-mono")}>{email}</span>
        </div>
        <div className={cn(fieldLabelClass, "sm:col-span-2 sm:max-w-[50%]")}>
          {"User ID "}
          <span className="flex min-h-10 items-center gap-2 rounded-lg border border-border-strong bg-transparent px-3 normal-case tracking-normal text-fg">
            <MonoText
              className="min-w-0 flex-1 truncate text-fg"
              size="lg"
              sx={{ color: "inherit" }}
            >
              {publicId}
            </MonoText>
            <CopyButton label="Copy user ID" size="sm" text={publicId} />
          </span>
        </div>
      </form>
      {message ? (
        <span className={cn(feedbackClass, "mt-3 block text-fg-muted")}>{message}</span>
      ) : null}
    </AccountSection>
  );
}
