"use client";

import { Button, Input, Modal } from "@/components/ui";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { domainSchema } from "@/lib/schemas/project";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useForm } from "react-hook-form";
import { z } from "zod";

const domainChangeSchema = z.object({
  confirmationDomain: z.string().trim().max(253),
  newDomain: domainSchema,
});

type DomainChangeForm = z.infer<typeof domainChangeSchema>;

export type DomainChangeRequest = {
  confirmationDomain: string;
  newDomain: string;
  projectId: string;
};

export type DomainChangeConfirmationProps = {
  currentDomain: string | null;
  onClose: () => void;
  onConfirmed?: (domain: string) => void;
  open: boolean;
  projectId: string;
  requestDomainChange: (request: DomainChangeRequest) => Promise<unknown>;
};

const labelClass = "font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted";

export function DomainChangeConfirmation({
  currentDomain,
  onClose,
  onConfirmed,
  open,
  projectId,
  requestDomainChange,
}: Readonly<DomainChangeConfirmationProps>) {
  const renderedCurrentDomain = currentDomain?.trim() ?? "";
  const hasCurrentDomain = renderedCurrentDomain.length > 0;
  const form = useForm<DomainChangeForm>({
    defaultValues: { confirmationDomain: "", newDomain: renderedCurrentDomain },
    mode: "onChange",
    resolver: zodResolver(domainChangeSchema),
  });
  const requestedDomain = form.watch("newDomain")?.trim() ?? "";
  const confirmationDomain = form.watch("confirmationDomain")?.trim() ?? "";
  const isChanged = requestedDomain !== renderedCurrentDomain;
  const isConfirmed = hasCurrentDomain
    ? confirmationDomain === renderedCurrentDomain
    : confirmationDomain === "";
  const canConfirm = form.formState.isValid && isChanged && isConfirmed;

  function close() {
    form.reset({ confirmationDomain: "", newDomain: renderedCurrentDomain });
    onClose();
  }

  async function submit(values: DomainChangeForm) {
    try {
      await requestDomainChange({
        confirmationDomain: values.confirmationDomain,
        newDomain: values.newDomain,
        projectId,
      });
      onConfirmed?.(values.newDomain);
      close();
    } catch (error: unknown) {
      form.setError("newDomain", {
        message: actionErrorMessage(error, "The domain could not be changed."),
      });
    }
  }

  return (
    <Modal
      footer={
        <>
          <Button onClick={close} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={!canConfirm}
            form="domain-change-confirmation-form"
            loading={form.formState.isSubmitting}
            loadingLabel="Confirming"
            size="sm"
            type="submit"
          >
            Confirm domain change
          </Button>
        </>
      }
      headerDivider
      onClose={close}
      open={open}
      size="md"
      title="Confirm a new project domain"
    >
      <form
        className="space-y-4"
        id="domain-change-confirmation-form"
        onSubmit={form.handleSubmit(submit)}
      >
        <p className="m-0 text-[12.5px] leading-[1.55] text-fg-muted">
          Change the domain this project uses to identify its matching results.
        </p>
        <div>
          <label className={labelClass} htmlFor="domain-change-next-domain">
            New domain
          </label>
          <Input
            autoComplete="url"
            className="mt-1.5 font-mono"
            id="domain-change-next-domain"
            spellCheck={false}
            {...form.register("newDomain")}
          />
          {form.formState.errors.newDomain ? (
            <p className="m-0 mt-1.5 text-[11.5px] font-medium text-red-text">
              {form.formState.errors.newDomain.message}
            </p>
          ) : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="domain-change-confirmation-domain">
            {hasCurrentDomain
              ? `Type ${renderedCurrentDomain} to confirm`
              : "Leave confirmation blank to set the first domain"}
          </label>
          <Input
            autoComplete="off"
            className="mt-1.5 font-mono"
            id="domain-change-confirmation-domain"
            spellCheck={false}
            {...form.register("confirmationDomain")}
          />
          {form.formState.errors.confirmationDomain ? (
            <p className="m-0 mt-1.5 text-[11.5px] font-medium text-red-text">
              {form.formState.errors.confirmationDomain.message}
            </p>
          ) : hasCurrentDomain &&
            confirmationDomain &&
            confirmationDomain !== renderedCurrentDomain ? (
            <p className="m-0 mt-1.5 text-[11.5px] font-medium text-red-text">
              The confirmation must match {renderedCurrentDomain}.
            </p>
          ) : !hasCurrentDomain && confirmationDomain ? (
            <p className="m-0 mt-1.5 text-[11.5px] font-medium text-red-text">
              Leave the confirmation blank to set this project&apos;s first domain.
            </p>
          ) : null}
        </div>
        <div className="rounded-[9px] border border-dashed border-border-strong px-3 py-2.5">
          <p className="m-0 font-mono text-[9.5px] uppercase tracking-[1.1px] text-fg-muted">
            After you confirm
          </p>
          <p className="m-0 mt-1 text-[12px] leading-[1.55] text-fg-muted">
            Existing checks keep their original results. Future checks use the new domain and its
            subdomains to identify project matches.
          </p>
          <p className="m-0 mt-1 text-[12px] leading-[1.55] text-fg-muted">
            Competitor history stays tied to the domain that was used when each check ran.
          </p>
        </div>
      </form>
    </Modal>
  );
}
