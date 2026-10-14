"use client";

import { BusinessArchivePrompt } from "@/components/business-locations/BusinessArchivePrompt";
import { BusinessIdentityEditor } from "@/components/business-locations/BusinessIdentityEditor";
import { BusinessLocationsList } from "@/components/business-locations/BusinessLocationsList";
import {
  readBusinessLocationCurrent,
  saveBusinessIdentity,
  saveBusinessLocationState,
} from "@/lib/business-location-store/session-actions";
import type {
  BusinessReadPermissions,
  LocationSummary,
} from "@/lib/business-locations/ui-contracts";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { BusinessAssignmentWorkspace } from "./BusinessAssignmentWorkspace";
import { BusinessIdentityHistory } from "./BusinessIdentityHistory";
import { BusinessMatchesWorkspace } from "./BusinessMatchesWorkspace";

type Editor =
  | { kind: "create" }
  | { kind: "identity"; id: string }
  | { kind: "state"; id: string; state: LocationSummary["state"] };
export function BusinessLocationsWorkspace({
  projectId,
  initialLocations,
  permissions,
}: {
  projectId: string;
  initialLocations: readonly LocationSummary[];
  permissions: BusinessReadPermissions;
}) {
  const t = useTranslations("shared.businessLocations");
  const [locations, setLocations] = useState(initialLocations);
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [readError, setReadError] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const current =
    editor && editor.kind !== "create" ? locations.find((row) => row.publicId === editor.id) : null;
  const selectedLocation = locations.find((row) => row.publicId === selected);
  function update(location: LocationSummary) {
    setLocations((rows) => {
      const previous = rows.find((row) => row.publicId === location.publicId);
      if (
        previous &&
        (previous.version > location.version ||
          previous.identity.revision > location.identity.revision)
      )
        return rows;
      return previous
        ? rows.map((row) => (row.publicId === location.publicId ? location : row))
        : [...rows, location];
    });
  }
  function focusReturn() {
    list.current?.focus();
  }
  function saved(location: LocationSummary) {
    update(location);
    setSelected(location.publicId);
    setEditor(null);
    focusReturn();
  }
  async function refresh(id: string) {
    setReadError(false);
    try {
      update(await readBusinessLocationCurrent(projectId, id));
    } catch {
      setReadError(true);
    }
  }
  return (
    <div className="space-y-3">
      <div ref={list} tabIndex={-1}>
        <BusinessLocationsList
          locations={locations}
          selectedLocationId={selected}
          permissions={permissions}
          translate={t}
          onSelect={setSelected}
          onCreate={() => setEditor({ kind: "create" })}
          onEdit={(id) => setEditor({ kind: "identity", id })}
          onState={(id, state) => setEditor({ kind: "state", id, state })}
        />
      </div>
      {readError ? (
        <p role="alert" className="text-sm text-red-text">
          {t("readError")}
        </p>
      ) : null}
      {editor?.kind === "create" || (editor?.kind === "identity" && current) ? (
        <BusinessIdentityEditor
          key={editor.kind === "create" ? "create" : editor.id}
          projectId={projectId}
          location={current}
          permissions={permissions}
          translate={t}
          save={saveBusinessIdentity}
          onSaved={saved}
          onCancel={() => setEditor(null)}
          onFocusReturn={focusReturn}
          onRequestCurrent={current ? () => void refresh(current.publicId) : undefined}
        />
      ) : null}
      {editor?.kind === "state" && current ? (
        <BusinessArchivePrompt
          key={`${current.publicId}:${editor.state}`}
          projectId={projectId}
          location={current}
          nextState={editor.state}
          permissions={permissions}
          translate={t}
          save={saveBusinessLocationState}
          onSaved={saved}
          onCancel={() => setEditor(null)}
          onFocusReturn={focusReturn}
          onRequestCurrent={() => void refresh(current.publicId)}
        />
      ) : null}
      <BusinessAssignmentWorkspace
        projectId={projectId}
        locations={locations}
        permissions={permissions}
        translate={t}
      />
      {selectedLocation ? (
        <BusinessMatchesWorkspace
          key={selectedLocation.publicId}
          projectId={projectId}
          location={selectedLocation}
          permissions={permissions}
          translate={t}
        />
      ) : null}
      {selectedLocation ? (
        <BusinessIdentityHistory
          key={selectedLocation.publicId}
          projectId={projectId}
          location={selectedLocation}
          translate={t}
        />
      ) : null}
    </div>
  );
}
