"use client";

import { Button } from "@/components/ui/Button";
import { authClient } from "@/lib/auth/client";
import { loginErrorReturnTo, returnToOrDefault } from "@/lib/auth/return-to";
import { SIGNED_IN_HOME_PATH } from "@/lib/auth/two-factor-routes";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { cn } from "@/lib/ui/cn";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/dist/csr/CircleNotch";
import { KeyIcon as Key } from "@phosphor-icons/react/dist/csr/Key";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const challengeSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("totp"),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit authenticator code."),
  }),
  z.object({
    method: z.literal("backup"),
    code: z.string().trim().min(1, "Enter a backup code.").max(128, "Enter a valid backup code."),
  }),
]);

type ChallengeValues = z.infer<typeof challengeSchema>;
type ChallengeMethod = ChallengeValues["method"];

const methodButtonStyle = {
  "--control-border-color": "var(--border-control)",
  borderRadius: UI_RADIUS_ROLES.control,
  "--control-color": "var(--fg-muted)",
  fontSize: "13px",
  fontWeight: 600,
  padding: "8px 12px",
  "--control-selected-background-color": "var(--accent-soft)",
  "--control-selected-border-color": "var(--accent)",
  "--control-selected-color": "var(--accent-text)",
} as const;

type TwoFactorChallengeFormProps = {
  returnTo?: string;
};

export function TwoFactorChallengeForm({
  returnTo = SIGNED_IN_HOME_PATH,
}: Readonly<TwoFactorChallengeFormProps> = {}) {
  const router = useRouter();
  const destination = returnToOrDefault(returnTo);
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<ChallengeValues>({
    defaultValues: { method: "totp", code: "" },
    mode: "onSubmit",
    resolver: zodResolver(challengeSchema),
  });
  const method = form.watch("method");
  const submitting = form.formState.isSubmitting;

  function selectMethod(nextMethod: ChallengeMethod) {
    setMessage(null);
    form.reset({ method: nextMethod, code: "" });
  }

  async function verify(values: ChallengeValues) {
    setMessage(null);
    const response =
      values.method === "totp"
        ? await authClient.twoFactor.verifyTotp({ code: values.code })
        : await authClient.twoFactor.verifyBackupCode({ code: values.code });

    if (response.error) {
      setMessage("That code is invalid, expired, or already used.");
      form.setValue("code", "", { shouldDirty: true });
      form.setFocus("code");
      return;
    }

    router.replace(destination);
    router.refresh();
  }

  const submitChallenge = form.handleSubmit(verify);

  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void submitChallenge();
  }

  return (
    <div className="w-full max-w-[380px]">
      <span className="grid h-[46px] w-[46px] place-items-center rounded-card bg-accent-soft text-accent-solid">
        <ShieldCheck aria-hidden size={23} weight="regular" />
      </span>
      <h1 className="mt-4.5 mb-0 text-[25px] font-semibold tracking-[-0.7px] text-fg">
        Verify it&apos;s you
      </h1>
      <p className="mt-2 mb-0 text-[14px] leading-[1.5] text-fg-muted">
        Your email code was accepted. Complete the second step to sign in.
      </p>

      <fieldset className="mt-6 grid grid-cols-2 gap-2 border-0 p-0">
        <legend className="sr-only">Verification method</legend>
        <Button
          aria-pressed={method === "totp"}
          disabled={submitting}
          onClick={() => selectMethod("totp")}
          startIcon={<ShieldCheck aria-hidden size={16} weight="regular" />}
          style={methodButtonStyle}
          type="button"
          variant="secondary"
        >
          Authenticator
        </Button>
        <Button
          aria-pressed={method === "backup"}
          disabled={submitting}
          onClick={() => selectMethod("backup")}
          startIcon={<Key aria-hidden size={16} weight="regular" />}
          style={methodButtonStyle}
          type="button"
          variant="secondary"
        >
          Backup code
        </Button>
      </fieldset>

      <div className="mt-5">
        <label
          className="block text-[10.5px] uppercase tracking-[0.5px] text-fg-muted"
          htmlFor="two-factor-code"
        >
          {method === "totp" ? "Authenticator code" : "Backup code"}
        </label>
        <input
          autoComplete={method === "totp" ? "one-time-code" : "off"}
          className={cn(
            "mt-[7px] box-border w-full rounded-control border border-border-control bg-transparent px-[13px] py-3 text-[14.5px] font-medium tabular-nums text-fg outline-none focus:border-accent",
            form.formState.errors.code && "border-red focus:border-red",
          )}
          id="two-factor-code"
          inputMode={method === "totp" ? "numeric" : "text"}
          maxLength={method === "totp" ? 6 : 128}
          onKeyDown={submitOnEnter}
          placeholder={method === "totp" ? "000000" : "xxxxx-xxxxx"}
          type="text"
          {...form.register("code")}
        />
        {form.formState.errors.code ? (
          <p className="mt-2 mb-0 text-[13px] text-red-text">
            {form.formState.errors.code.message}
          </p>
        ) : null}
        {message ? (
          <p aria-live="polite" className="mt-2 mb-0 text-[13px] text-red-text">
            {message}
          </p>
        ) : null}

        <Button
          disabled={submitting}
          endIcon={
            submitting ? (
              <CircleNotch aria-hidden className="bv-spin" size={16} weight="regular" />
            ) : (
              <CaretRight aria-hidden size={16} weight="regular" />
            )
          }
          fullWidth
          onClick={() => void submitChallenge()}
          style={{
            borderRadius: UI_RADIUS_ROLES.control,
            fontSize: "14.5px",
            fontWeight: 600,
            marginTop: "16px",
            padding: "12px",
          }}
          type="button"
          variant="primary"
        >
          {submitting ? "Verifying..." : "Verify and continue"}
        </Button>
      </div>

      <a
        className="mt-5 block text-center text-[13px] font-semibold text-fg-muted no-underline hover:text-fg"
        href={loginErrorReturnTo(destination)}
      >
        Cancel and return to sign in
      </a>
    </div>
  );
}
