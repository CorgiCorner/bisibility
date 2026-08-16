import { Avatar, MonoText } from "@/components/ui";
import { initials as avatarInitials } from "@/lib/avatar/initials";

export type AvatarFieldProps = {
  email: string;
  /** Server-derived Gravatar URL. Displayed by the shared Avatar with an initials fallback. */
  image: string | null;
  name: string;
};

export function AvatarField({ email, image, name }: Readonly<AvatarFieldProps>) {
  // No name yet: lead with the email once instead of an "Unnamed" placeholder.
  const displayName = name.trim() || email;
  const showEmail = Boolean(email) && email !== displayName;

  return (
    <div>
      <div className="flex items-center gap-[14px]">
        <Avatar
          alt=""
          className="grid h-[54px] w-[54px] flex-none place-items-center rounded-[14px] bg-accent-solid font-mono text-lg font-semibold text-primary-contrast"
          initials={avatarInitials(name, email)}
          src={image}
        />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-fg">{displayName}</div>
          {showEmail ? (
            <MonoText className="truncate" muted size="lg">
              {email}
            </MonoText>
          ) : null}
        </div>
      </div>
    </div>
  );
}
