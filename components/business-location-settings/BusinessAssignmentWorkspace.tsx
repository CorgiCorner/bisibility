"use client";

import { BusinessSectionHeading } from "@/components/business-locations/BusinessSectionHeading";
import { BusinessSubjectAssignment } from "@/components/business-locations/BusinessSubjectAssignment";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import {
  readBusinessAssignmentCurrent,
  saveBusinessAssignment,
  searchBusinessAssignmentScopes,
} from "@/lib/business-location-store/session-actions";
import type {
  AssignmentScopeChoice,
  AssignmentSummary,
  BusinessReadPermissions,
  BusinessTranslator,
  LocationSummary,
} from "@/lib/business-locations/ui-contracts";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { useId, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

const filterSchema = z.object({
  kind: z.enum(["keyword", "market"]),
  search: z.string().trim().max(200),
});
type Filter = z.infer<typeof filterSchema>;

export function BusinessAssignmentWorkspace({
  projectId,
  locations,
  permissions,
  translate: t,
}: {
  projectId: string;
  locations: readonly LocationSummary[];
  permissions: BusinessReadPermissions;
  translate: BusinessTranslator;
}) {
  const searchId = useId();
  const form = useForm<Filter>({
    defaultValues: { kind: "keyword", search: "" },
    resolver: zodResolver(filterSchema),
  });
  const [page, setPage] = useState<{
    choices: AssignmentScopeChoice[];
    next: string | null;
    filter: Filter;
  } | null>(null);
  const [assignment, setAssignment] = useState<AssignmentSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);
  async function search(filter: Filter, after: string | null = null) {
    const sequence = ++request.current;
    setPending(true);
    setError(false);
    try {
      const result = await searchBusinessAssignmentScopes(projectId, { ...filter, after });
      if (sequence === request.current) setPage({ ...result, filter });
    } catch {
      if (sequence === request.current) setError(true);
    } finally {
      if (sequence === request.current) setPending(false);
    }
  }
  async function select(choice: AssignmentScopeChoice) {
    const sequence = ++request.current;
    setPending(true);
    setError(false);
    setAssignment(null);
    try {
      const current = await readBusinessAssignmentCurrent(projectId, choice.scope);
      if (sequence === request.current) setAssignment(current);
    } catch {
      if (sequence === request.current) setError(true);
    } finally {
      if (sequence === request.current) setPending(false);
    }
  }
  async function refreshAssignment() {
    if (!assignment) return;
    const sequence = ++request.current;
    setPending(true);
    setError(false);
    try {
      const current = await readBusinessAssignmentCurrent(projectId, assignment.scope);
      if (sequence === request.current) setAssignment(current);
    } catch {
      if (sequence === request.current) setError(true);
    } finally {
      if (sequence === request.current) setPending(false);
    }
  }
  return (
    <div className="space-y-3">
      <Card component="section">
        <BusinessSectionHeading
          title={t("chooseAssignmentScope")}
          summary={t("scopeSelectionSummary")}
          help={t("scopeSelectionHelp")}
          translate={t}
        />
        <form
          onSubmit={form.handleSubmit((values) => search(values))}
          className="mt-3 flex min-w-0 flex-wrap items-center gap-2"
        >
          <MenuSelect
            ariaLabel={t("assignmentScopeKind")}
            compact
            value={form.watch("kind")}
            options={[
              { value: "keyword", label: t("keywordScope") },
              { value: "market", label: t("marketScope") },
            ]}
            onChange={(value) => {
              if (value === "keyword" || value === "market") form.setValue("kind", value);
            }}
          />
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            <Controller
              control={form.control}
              name="search"
              render={({ field, fieldState }) => (
                <ToolbarSearch
                  id={searchId}
                  className="min-w-0 flex-1 sm:w-[280px] sm:flex-none"
                  variant="outlined"
                  label={t("searchScope")}
                  placeholder={t("searchScope")}
                  inputRef={(input) => {
                    field.ref(input);
                    input?.setAttribute("aria-invalid", String(fieldState.invalid));
                  }}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  onSubmit={() => {
                    if (!pending) void form.handleSubmit((values) => search(values))();
                  }}
                />
              )}
            />
            <Button size="sm" type="submit" disabled={pending}>
              {t("searchScope")}
            </Button>
          </div>
        </form>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-text">
            {t("readError")}
          </p>
        ) : null}
        {pending ? (
          <p role="status" className="mt-3 text-sm">
            {t("loading")}
          </p>
        ) : null}
        {page ? (
          <>
            <ul className="m-0 mt-3 list-none space-y-1 p-0">
              {page.choices.map((choice) => (
                <li key={choice.scope.id}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-auto max-w-full justify-start whitespace-normal text-left"
                    disabled={pending}
                    onClick={() => void select(choice)}
                  >
                    {t(choice.scope.kind === "keyword" ? "keywordScope" : "marketScope")}:{" "}
                    {choice.name} · {choice.location}
                    {choice.device ? ` · ${t(`devices.${choice.device}`)}` : ""}
                  </Button>
                </li>
              ))}
            </ul>
            {!page.choices.length ? (
              <p className="mt-3 text-sm text-fg-muted">{t("noScopes")}</p>
            ) : null}
            {page.next ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                className="mt-3"
                onClick={() => void search(page.filter, page.next)}
              >
                {t("nextScopes")}
              </Button>
            ) : null}
          </>
        ) : null}
      </Card>
      {assignment ? (
        <BusinessSubjectAssignment
          key={`${assignment.scope.kind}:${assignment.scope.id}`}
          projectId={projectId}
          assignment={assignment}
          locations={locations}
          permissions={permissions}
          translate={t}
          save={saveBusinessAssignment}
          onSaved={setAssignment}
          onRequestCurrent={() => void refreshAssignment()}
        />
      ) : null}
    </div>
  );
}
