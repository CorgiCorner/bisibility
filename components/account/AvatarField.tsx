"use client";

import { MonoText } from "@/components/ui";
import { updateAvatar } from "@/lib/actions/account";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  accentButtonClass,
  feedbackClass,
  fieldInputClass,
  fieldLabelClass,
  ghostButtonClass,
} from "./account-ui";

const avatarSchema = z.object({
  image: z
    .string()
    .trim()
    .max(2048, "Image URL is too long.")
    .refine(
      (value) => value === "" || /^https:\/\/\S+$/i.test(value),
      "Enter a valid https image URL.",
    ),
});

type AvatarForm = z.infer<typeof avatarSchema>;

export type AvatarFieldProps = {
  email: string;
  image: string | null;
  name: string;
};

function avatarInitials(name: string, email: string): string {
  const source = name.trim() || email.trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0])
      .join("") || "U"
  ).toUpperCase();
}

export function AvatarField({ email, image, name }: Readonly<AvatarFieldProps>) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<AvatarForm>({
    defaultValues: { image: image ?? "" },
    mode: "onChange",
    resolver: zodResolver(avatarSchema),
  });

  function save(values: AvatarForm) {
    setMessage(null);
    startTransition(() => {
      void updateAvatar(values)
        .then((result) => {
          reset({ image: result.image ?? "" });
          setMessage(result.image ? "Avatar updated." : "Avatar removed.");
          setEditing(false);
          router.refresh();
        })
        .catch((error: unknown) =>
          setMessage(actionErrorMessage(error, "Avatar could not be saved.")),
        );
    });
  }

  function remove() {
    reset({ image: "" });
    save({ image: "" });
  }

  // No name yet: lead with the email once instead of an "Unnamed" placeholder.
  const displayName = name.trim() || email;
  const showEmail = Boolean(email) && email !== displayName;

  return (
    <div>
      <div className="flex items-center gap-[14px]">
        {image ? (
          // biome-ignore lint/performance/noImgElement: User-provided avatar URLs can use arbitrary HTTPS hosts unsupported by the image optimizer.
          <img
            alt=""
            className="h-[54px] w-[54px] flex-none rounded-[14px] object-cover"
            src={image}
          />
        ) : (
          <span className="grid h-[54px] w-[54px] flex-none place-items-center rounded-[14px] bg-accent-solid font-mono text-lg font-semibold text-primary-contrast">
            {avatarInitials(name, email)}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-fg">{displayName}</div>
          {showEmail ? (
            <MonoText className="truncate" muted size="lg">
              {email}
            </MonoText>
          ) : null}
        </div>
        <button
          className={cn(ghostButtonClass, "ml-auto self-start px-3 text-xs")}
          onClick={() => {
            setMessage(null);
            setEditing((open) => !open);
          }}
          type="button"
        >
          {editing ? "Close" : "Change"}
        </button>
      </div>
      {editing ? (
        <form className="mt-[14px] grid gap-[10px]" onSubmit={handleSubmit(save)}>
          <label className={fieldLabelClass}>
            {"Avatar image URL "}
            <input
              className={fieldInputClass}
              placeholder="https://example.com/avatar.png"
              {...register("image")}
            />
            {errors.image ? (
              <span className={cn(feedbackClass, "text-red-text")}>{errors.image.message}</span>
            ) : null}
          </label>
          <div className="flex items-center gap-2">
            <button className={accentButtonClass} disabled={isPending} type="submit">
              {isPending ? "Saving" : "Save"}
            </button>
            {image ? (
              <button
                className={cn(ghostButtonClass, "px-3 text-xs")}
                disabled={isPending}
                onClick={remove}
                type="button"
              >
                Remove
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
      {message ? (
        <span className={cn(feedbackClass, "mt-2 block text-fg-muted")}>{message}</span>
      ) : null}
    </div>
  );
}
