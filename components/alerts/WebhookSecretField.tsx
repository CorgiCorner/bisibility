"use client";

import { Button, PasswordInput } from "@/components/ui";
import { useState } from "react";

const SECRET_BYTES = 32;

export function generateWebhookSecret(cryptoSource: Pick<Crypto, "getRandomValues"> = crypto) {
  const bytes = cryptoSource.getRandomValues(new Uint8Array(SECRET_BYTES));
  const encoded = btoa(String.fromCharCode(...bytes));
  return encoded.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

type WebhookSecretFieldProps = {
  fieldClassName: string;
  labelClassName: string;
  onChange: (value: string) => void;
  value: string;
};

export function WebhookSecretField({
  fieldClassName,
  labelClassName,
  onChange,
  value,
}: Readonly<WebhookSecretFieldProps>) {
  const [copied, setCopied] = useState(false);
  const [generated, setGenerated] = useState(false);
  const revealsGeneratedSecret = generated && value.length > 0;

  function generate() {
    onChange(generateWebhookSecret());
    setCopied(false);
    setGenerated(true);
  }

  async function copy() {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
  }

  return (
    <div className="grid gap-2">
      <label className={labelClassName} htmlFor="alert-webhook-hmac-secret">
        HMAC secret
        {revealsGeneratedSecret ? (
          <input
            className={fieldClassName}
            id="alert-webhook-hmac-secret"
            name="hmacSecret"
            onChange={(event) => {
              onChange(event.target.value);
              setGenerated(false);
            }}
            readOnly
            value={value}
          />
        ) : (
          <PasswordInput
            className={fieldClassName}
            id="alert-webhook-hmac-secret"
            minLength={16}
            name="hmacSecret"
            onChange={(event) => onChange(event.target.value)}
            placeholder="At least 16 characters"
            value={value}
          />
        )}
      </label>
      <div className="flex flex-wrap gap-2">
        <Button onClick={generate} size="sm" type="button" variant="secondary">
          Generate
        </Button>
        {revealsGeneratedSecret ? (
          <Button onClick={() => void copy()} size="sm" type="button" variant="secondary">
            {copied ? "Copied" : "Copy secret"}
          </Button>
        ) : null}
      </div>
      <p className="m-0 text-[10.5px] leading-relaxed text-fg-muted">
        Generated secrets use 32 random bytes. Copy it now; it cannot be read back after saving.
      </p>
    </div>
  );
}
