import { z } from "zod";

const timestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Expected a timestamp",
});

const incidentSchema = z.object({
  begin: timestamp,
  end: timestamp.nullable().optional(),
  external_desc: z.string().trim().min(1),
  id: z.string().trim().min(1),
  modified: timestamp,
  service_name: z.string().trim().min(1),
  uri: z.string().trim().min(1),
});

const feedSchema = z.array(incidentSchema);

export type SearchEngineIncident = {
  beginsAt: Date;
  endsAt: Date | null;
  externalId: string;
  modifiedAt: Date;
  name: string;
  service: string;
  uri: string;
};

export function parseSearchEngineIncidents(payload: unknown): SearchEngineIncident[] {
  return feedSchema.parse(payload).map((incident) => ({
    beginsAt: new Date(incident.begin),
    endsAt: incident.end ? new Date(incident.end) : null,
    externalId: incident.id,
    modifiedAt: new Date(incident.modified),
    name: incident.external_desc,
    service: incident.service_name,
    uri: incident.uri,
  }));
}
