"use client";

import { Button, CopyButton, Modal } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { cn } from "@/lib/ui/cn";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const roleOptions = [
  { desc: "Can manage settings, team members and keys.", label: "Admin", value: "admin" },
  { desc: "Can manage keywords, tags and alert rules.", label: "Editor", value: "member" },
  { desc: "Can view dashboards, exports and reports.", label: "Viewer", value: "viewer" },
] as const;

const inviteSchema = z.object({
  email: z.string().trim().pipe(z.email("Enter a teammate email.")),
  role: z.enum(["admin", "member", "viewer"]),
});

type InviteForm = z.infer<typeof inviteSchema>;
export type InviteAction = (
  input: InviteForm & { projectId: string },
) => Promise<{ inviteLink: string }>;

export type InviteModalProps = {
  canAssignAdmin?: boolean;
  domain: string;
  open: boolean;
  onClose: () => void;
  inviteMember?: InviteAction;
  onInviteSent?: () => void;
  projectId?: string;
};

export function InviteModal({
  canAssignAdmin = true,
  domain,
  inviteMember,
  onClose,
  onInviteSent,
  open,
  projectId,
}: Readonly<InviteModalProps>) {
  const [inviteLink, setInviteLink] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const invitesAvailable = Boolean(inviteMember && projectId);
  const form = useForm<InviteForm>({
    defaultValues: { email: "", role: "member" },
    mode: "onChange",
    resolver: zodResolver(inviteSchema),
  });
  const primaryDisabled =
    !invitesAvailable || !form.formState.isValid || form.formState.isSubmitting || sent;
  const selectedRole = form.watch("role");
  const availableRoles = canAssignAdmin
    ? roleOptions
    : roleOptions.filter((role) => role.value !== "admin");

  function handleClose() {
    setInviteLink("");
    setSentEmail("");
    setSent(false);
    setSubmitError(null);
    form.reset({ email: "", role: "member" });
    onClose();
  }

  async function onSubmit(values: InviteForm) {
    if (!inviteMember || !projectId) {
      setSubmitError("Invites are unavailable for this project.");
      return;
    }

    setSubmitError(null);
    try {
      const result = await inviteMember({ ...values, projectId });
      setInviteLink(result.inviteLink);
      setSentEmail(values.email);
      setSent(true);
      onInviteSent?.();
    } catch (error) {
      setSubmitError(actionErrorMessage(error, "Invite could not be sent."));
    }
  }

  return (
    <Modal
      footer={
        <>
          <Button onClick={handleClose} size="sm" type="button" variant="ghost">
            {sent ? "Done" : "Cancel"}
          </Button>
          {sent ? null : (
            <Button
              disabled={!invitesAvailable || !form.formState.isValid}
              form="invite-teammate-form"
              loading={form.formState.isSubmitting}
              loadingLabel="Sending"
              startIcon={<PaperPlaneTilt aria-hidden size={15} weight="bold" />}
              type="submit"
            >
              Send invite
            </Button>
          )}
        </>
      }
      onClose={handleClose}
      onPrimaryAction={form.handleSubmit(onSubmit)}
      open={open}
      primaryActionDisabled={primaryDisabled}
      size="md"
      initialFocus={() => form.setFocus("email")}
      title={
        <span className="block">
          <span className="block">Invite teammate</span>
          <span className="mt-[3px] block text-[12.5px] font-normal leading-normal tracking-normal text-fg-muted">
            They&apos;ll get access to {domain || "this project"}.
          </span>
        </span>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center px-2 pb-1.5 pt-3.5 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-[13px] bg-green/10 text-green-text">
            <PaperPlaneTilt aria-hidden size={24} weight="fill" />
          </span>
          <div className="mt-3.5 text-[15px] font-semibold text-fg">Invitation sent</div>
          <p className="m-0 mt-1.5 max-w-[300px] text-[13px] text-fg-muted">
            We emailed an invite to {sentEmail}. You can also share this link directly.
          </p>
          <div className="mt-4 flex w-full items-center gap-2 rounded-[9px] border border-border-strong bg-transparent px-3 py-[9px]">
            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-muted">
              {inviteLink}
            </span>
            <CopyButton label="Copy invite link" size="md" text={inviteLink} />
          </div>
        </div>
      ) : (
        <form id="invite-teammate-form" onSubmit={form.handleSubmit(onSubmit)}>
          <label
            className="block font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted"
            htmlFor="invite-email"
          >
            Email address
          </label>
          <input
            aria-describedby={form.formState.errors.email ? "invite-email-error" : undefined}
            aria-invalid={Boolean(form.formState.errors.email)}
            className="mt-[7px] min-h-11 w-full rounded-[9px] border border-border-strong bg-transparent px-[13px] font-mono text-[13.5px] font-medium text-fg outline-none focus:border-accent"
            id="invite-email"
            inputMode="email"
            placeholder="teammate@acme.dev"
            type="email"
            {...form.register("email")}
          />
          {form.formState.errors.email ? (
            <div className="mt-1.5 text-[11.5px] font-medium text-red-text" id="invite-email-error">
              {form.formState.errors.email.message}
            </div>
          ) : null}
          <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            Role
          </div>
          <div className="mt-[9px] flex flex-col gap-[7px]">
            {availableRoles.map((role) => {
              const active = selectedRole === role.value;
              return (
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-[11px] border-[1.5px] px-[13px] py-[11px]",
                    active ? "border-accent bg-accent-soft" : "border-border-strong bg-bg-elev",
                  )}
                  key={role.value}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-fg">{role.label}</span>
                    <span className="mt-px block text-[11.5px] text-fg-muted">{role.desc}</span>
                  </span>
                  <input
                    className="sr-only"
                    type="radio"
                    value={role.value}
                    {...form.register("role")}
                  />
                  <span
                    className={cn(
                      "grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-[1.5px]",
                      active ? "border-accent" : "border-border-strong",
                    )}
                  >
                    <span
                      className={cn(
                        "h-[9px] w-[9px] rounded-full bg-accent",
                        !active && "invisible",
                      )}
                    />
                  </span>
                </label>
              );
            })}
          </div>
          {submitError ? (
            <div className="mt-3 text-[12px] font-medium text-red-text">{submitError}</div>
          ) : null}
        </form>
      )}
    </Modal>
  );
}
