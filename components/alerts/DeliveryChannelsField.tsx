"use client";

import { Checkbox, Tooltip } from "@/components/ui";
import { SLACK_ALERT_CHANNEL_DASHBOARD_LABEL } from "@/lib/alerts/channel-availability";
import type { NewRuleForm } from "@/lib/alerts/new-rule-data";
import type { AlertChannelInput } from "@/lib/alerts/schema";
import {
  EnvelopeSimpleIcon as EnvelopeSimple,
  LockSimpleIcon as LockSimple,
  SlackLogoIcon as SlackLogo,
  WebhooksLogoIcon as WebhooksLogo,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react/lib";
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";

type DeliveryChannelsFieldProps = {
  register: UseFormRegister<NewRuleForm>;
  setValue: UseFormSetValue<NewRuleForm>;
  watch: UseFormWatch<NewRuleForm>;
};

const deliveryChannels = [
  { Icon: EnvelopeSimple, label: "Email", name: "email" },
  { Icon: SlackLogo, label: "Slack", name: "slack" },
  { Icon: WebhooksLogo, label: "Webhook", name: "webhook" },
] satisfies { Icon: Icon; label: string; name: AlertChannelInput }[];

export function DeliveryChannelsField({
  register,
  setValue,
  watch,
}: Readonly<DeliveryChannelsFieldProps>) {
  const channels = watch("channels") ?? [];

  function toggleChannel(channel: AlertChannelInput) {
    const next = channels.includes(channel)
      ? channels.filter((item) => item !== channel)
      : [...channels, channel];

    setValue("channels", next, { shouldDirty: true, shouldValidate: true });
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        className="flex cursor-default items-center gap-[11px] rounded-[10px] border border-accent bg-accent-soft px-[13px] py-[11px]"
        htmlFor="delivery-channel-feed"
      >
        <Checkbox
          aria-label="In-app feed"
          checked
          id="delivery-channel-feed"
          readOnly
          tabIndex={-1}
        />
        <span className="flex-1 text-[13px] font-semibold">In-app feed</span>
        <span className="font-mono text-[10px] text-accent-text">always on</span>
      </label>
      {deliveryChannels.map(({ Icon, label, name }) => {
        const checked = channels.includes(name);
        const unavailable = name === "slack";

        return (
          <label
            className={`flex items-center gap-[11px] rounded-[10px] border px-[13px] py-[11px] transition-colors ${
              unavailable
                ? "cursor-not-allowed border-border-strong bg-transparent text-fg-muted"
                : checked
                  ? "border-accent bg-accent-soft"
                  : "cursor-pointer border-border-strong bg-bg-elev hover:border-accent"
            }`}
            htmlFor={`delivery-channel-${name}`}
            key={name}
          >
            {unavailable ? (
              <Checkbox
                aria-label={label}
                checked={checked}
                disabled
                id={`delivery-channel-${name}`}
                readOnly
              />
            ) : (
              <Checkbox
                aria-label={label}
                id={`delivery-channel-${name}`}
                value={name}
                {...register("channels")}
                checked={checked}
                onChange={() => toggleChannel(name)}
              />
            )}
            <Icon
              aria-hidden
              className={
                unavailable ? "text-fg-muted" : checked ? "text-accent-text" : "text-fg-muted"
              }
              size={15}
            />
            <span className="flex-1 text-[13px] font-semibold">{label}</span>
            {unavailable ? (
              <Tooltip content={SLACK_ALERT_CHANNEL_DASHBOARD_LABEL}>
                <span
                  aria-label={`${label} ${SLACK_ALERT_CHANNEL_DASHBOARD_LABEL}`}
                  className="inline-flex text-fg-muted"
                >
                  <LockSimple aria-hidden size={13} weight="bold" />
                </span>
              </Tooltip>
            ) : (
              <span
                className={`font-mono text-[10px] ${checked ? "text-accent-text" : "text-fg-muted"}`}
              >
                {checked ? "selected" : "optional"}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
