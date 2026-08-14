"use client";

import { Button } from "@/components/ui";

type FirstCheckErrorsProps = {
  keywordError: string | null;
  onRetryKeyword: () => void;
  submitError: string | null;
  timezoneError: string | null;
};

function ErrorText({ children, inRow = false }: Readonly<{ children: string; inRow?: boolean }>) {
  return (
    <p className={`m-0 text-[11.5px] text-red-text${inRow ? "" : " mt-2"}`} role="alert">
      {children}
    </p>
  );
}

export function FirstCheckErrors({
  keywordError,
  onRetryKeyword,
  submitError,
  timezoneError,
}: Readonly<FirstCheckErrorsProps>) {
  return (
    <>
      {timezoneError ? <ErrorText>{timezoneError}</ErrorText> : null}
      {keywordError ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ErrorText inRow>{keywordError}</ErrorText>
          <Button onClick={onRetryKeyword} size="sm" type="button" variant="secondary">
            Retry loading keyword
          </Button>
        </div>
      ) : null}
      {submitError ? <ErrorText>{submitError}</ErrorText> : null}
    </>
  );
}
