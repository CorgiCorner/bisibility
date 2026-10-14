"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { useId, useState } from "react";
import { BusinessSectionHeading } from "./BusinessSectionHeading";
import type { BusinessReadPermissions, BusinessTranslator, LocationSummary } from "./contracts";

export function BusinessLocationsList({
  locations,
  selectedLocationId,
  permissions,
  translate: t,
  onSelect,
  onCreate,
  onEdit,
  onState,
}: {
  locations: readonly LocationSummary[];
  selectedLocationId: string | null;
  permissions: BusinessReadPermissions;
  translate: BusinessTranslator;
  onSelect: (publicId: string) => void;
  onCreate: () => void;
  onEdit: (publicId: string) => void;
  onState: (publicId: string, state: LocationSummary["state"]) => void;
}) {
  const id = useId();
  const [visibility, setVisibility] = useState<"active" | "archived">("active");
  if (permissions.canRead !== true) return null;
  const shown = locations.filter((location) => location.state === visibility);
  return (
    <Card component="section" aria-labelledby={`${id}-title`} className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BusinessSectionHeading
          id={`${id}-title`}
          title={t("locations")}
          summary={t("locationsSummary")}
          help={t("locationsHelp")}
          translate={t}
        />
        {permissions.canWrite === true ? (
          <Button size="sm" onClick={onCreate}>
            {t("createLocation")}
          </Button>
        ) : null}
      </div>
      {permissions.canWrite !== true ? (
        <p className="m-0 mt-2 text-[12.5px] leading-5 text-fg-muted">{t("readOnly")}</p>
      ) : null}
      <div className="mt-3 flex">
        <MenuSelect
          ariaLabel={t("locationVisibility")}
          compact
          value={visibility}
          options={[
            { value: "active", label: t("states.active") },
            { value: "archived", label: t("states.archived") },
          ]}
          onChange={(value) => {
            if (value === "active" || value === "archived") setVisibility(value);
          }}
        />
      </div>
      {shown.length ? (
        <ul className="m-0 mt-3 flex list-none flex-col divide-y divide-border border-t border-border p-0">
          {shown.map((location) => (
            <li
              key={location.publicId}
              className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="min-w-0 flex-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-auto min-h-6 max-w-full justify-start whitespace-normal px-0 py-0 text-left text-[13px] leading-5"
                  aria-pressed={selectedLocationId === location.publicId}
                  onClick={() => onSelect(location.publicId)}
                >
                  {location.identity.name}
                </Button>
                {location.identity.address ? (
                  <p className="m-0 mt-0.5 break-words text-[12.5px] leading-5 text-fg-muted">
                    {location.identity.address}
                  </p>
                ) : null}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] leading-4 text-fg-muted">
                  {location.identity.domain ? (
                    <span className="break-all">{location.identity.domain}</span>
                  ) : null}
                  <span>{t(`roles.${location.role}`)}</span>
                  <span>
                    {t("identityRevision", { revision: String(location.identity.revision) })}
                  </span>
                </div>
              </div>
              {permissions.canWrite === true ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {location.state === "active" ? (
                    <Button size="sm" variant="outline" onClick={() => onEdit(location.publicId)}>
                      {t("editIdentity")}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      onState(
                        location.publicId,
                        location.state === "active" ? "archived" : "active",
                      )
                    }
                  >
                    {t(location.state === "active" ? "archive" : "restore")}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-3 text-[12.5px] leading-5 text-fg-muted">{t("noLocations")}</p>
      )}
    </Card>
  );
}
