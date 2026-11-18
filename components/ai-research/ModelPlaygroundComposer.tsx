"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FieldLabel, FormField } from "@/components/ui/FieldLabel";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/toast-context";
import type { ModelPlaygroundCopy } from "@/lib/model-playground/composer-copy";
import { utf8Bytes } from "@/lib/model-playground/schema";
import { useEffect } from "react";
import { ModelPlaygroundEstimate } from "./ModelPlaygroundEstimate";
import { ModelPlaygroundRetry } from "./ModelPlaygroundRetry";
import type { ModelPlaygroundController } from "./useModelPlayground";

export type ModelPlaygroundChoice = { code: string; name: string };
export function ModelPlaygroundComposer({
  controller: h,
  blockers,
  copy,
  disabled,
  languages,
  markets,
}: Readonly<{
  controller: ModelPlaygroundController;
  blockers: readonly string[];
  copy: ModelPlaygroundCopy;
  disabled: boolean;
  languages: readonly ModelPlaygroundChoice[];
  markets: readonly ModelPlaygroundChoice[];
}>) {
  const { showToast } = useToast();
  const failureMessage = h.failed
    ? h.failure === "not_dispatched"
      ? copy.runRejected
      : copy.runFailed
    : null;
  useEffect(() => {
    if (failureMessage) showToast(failureMessage, { severity: "error" });
  }, [failureMessage, showToast]);
  const prompt = h.input.prompt.trim();
  const promptError = h.form.formState.errors.prompt?.message;
  return (
    <Card data-model-playground-block="composer">
      <form className="grid min-w-0 gap-4" onSubmit={h.form.handleSubmit(() => h.run())}>
        <div className="grid min-w-0 gap-2 text-ui-body" data-form-field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldLabel htmlFor="native-model-prompt" label={copy.prompt} help={copy.promptHint} />
            <span className="text-ui-caption tabular-nums text-fg-muted" aria-live="off">
              {Array.from(prompt).length}/500 · {utf8Bytes(prompt)}/2,000 B
            </span>
          </div>
          <Textarea
            id="native-model-prompt"
            disabled={disabled}
            invalid={Boolean(h.form.formState.errors.prompt)}
            aria-invalid={Boolean(promptError)}
            aria-describedby={promptError ? "native-model-prompt-error" : undefined}
            {...h.form.register("prompt")}
          />
          {promptError ? (
            <p id="native-model-prompt-error" className="m-0 text-ui-caption text-red-text">
              {promptError}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-4" data-composer-controls>
          <FormField className="content-start" label={copy.language}>
            <MenuSelect
              ariaLabel={copy.language}
              disabled={disabled}
              onChange={(value) =>
                h.form.setValue("responseLanguage", value, { shouldValidate: true })
              }
              options={languages.map((language) => ({
                label: language.name,
                value: language.code,
              }))}
              size="input"
              triggerClassName="w-fit max-w-full"
              value={h.input.responseLanguage}
            />
          </FormField>
          <FormField className="content-start" label={copy.market} help={copy.marketHint}>
            <MenuSelect
              ariaLabel={copy.market}
              disabled={disabled}
              onChange={h.setMarket}
              options={markets.map((market) => ({ label: market.name, value: market.code }))}
              size="input"
              triggerClassName="w-fit max-w-full"
              value={h.market}
            />
          </FormField>
          <FormField
            className="content-start"
            label={copy.webSearch}
            htmlFor="native-model-search"
            help={copy.searchHint}
          >
            <div className="flex min-h-10 items-center max-sm:min-h-11">
              <Switch
                checked={h.search}
                className="w-fit border-0 bg-transparent p-0"
                disabled={disabled}
                id="native-model-search"
                onChange={(event) => h.setSearch(event.target.checked)}
              />
            </div>
          </FormField>
        </div>
        <div className="grid gap-2 border-t border-border pt-4">
          {blockers.map((blocker, index) => (
            <p
              key={`${index}-${blocker}`}
              className="m-0 text-ui-caption text-red-text"
              role="alert"
            >
              {blocker}
            </p>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {!h.issues.length ? (
              <ModelPlaygroundEstimate
                quote={h.quote}
                input={h.input}
                failed={h.quoteFailed}
                copy={copy}
              />
            ) : null}
            <Button
              className="ml-auto"
              disabled={!h.canLaunch || disabled}
              loading={h.pending}
              size="input"
              type="submit"
              title={disabled ? copy.readOnly : `${copy.limits} ${copy.historyNotice}`}
            >
              {copy.run}
            </Button>
          </div>
        </div>
      </form>
      <ModelPlaygroundRetry controller={h} copy={copy} />
    </Card>
  );
}
