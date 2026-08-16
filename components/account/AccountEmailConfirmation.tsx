import type { VerificationCodeForm } from "@/components/account/account-email-form";
import { Button, FieldLabel, Input } from "@/components/ui";
import type { FieldError, UseFormRegister } from "react-hook-form";

type AccountEmailConfirmationProps = {
  canConfirm: boolean;
  codeError?: FieldError;
  confirming: boolean;
  description: string;
  onConfirm: () => void;
  onSendCode: () => void;
  register: UseFormRegister<VerificationCodeForm>;
  sendingCode: boolean;
};

export function AccountEmailConfirmation({
  canConfirm,
  codeError,
  confirming,
  description,
  onConfirm,
  onSendCode,
  register,
  sendingCode,
}: Readonly<AccountEmailConfirmationProps>) {
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!canConfirm}
          loading={sendingCode}
          onClick={onSendCode}
          size="sm"
          type="button"
          variant="secondary"
        >
          Send code
        </Button>
        <p className="m-0 text-[12px] leading-5 text-fg-muted">{description}</p>
      </div>
      <FieldLabel htmlFor="account-email-code" label="Verification code" />
      <div className="mt-1.5 flex flex-wrap items-start gap-2">
        <div className="min-w-[180px] flex-1">
          <Input
            aria-describedby="account-email-code-error"
            aria-invalid={Boolean(codeError)}
            id="account-email-code"
            readOnly={!canConfirm}
            {...register("code")}
          />
          {codeError ? (
            <p
              className="m-0 mt-1 text-[11.5px] text-red-text"
              id="account-email-code-error"
              role="alert"
            >
              {codeError.message}
            </p>
          ) : null}
        </div>
        <Button
          disabled={!canConfirm}
          loading={confirming}
          onClick={onConfirm}
          size="sm"
          type="button"
        >
          Confirm email
        </Button>
      </div>
    </div>
  );
}
