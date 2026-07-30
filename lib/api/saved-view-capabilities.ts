import { savedViewSurfaces } from "@/lib/saved-views/model";

const surface = { enum: savedViewSurfaces, type: "string" } as const;

export function savedViewCapabilitySchemas(project: {
  properties: Record<string, unknown>;
  required: readonly string[];
  type: "object";
}) {
  return {
    create: {
      properties: {
        ...project.properties,
        config: { type: "object" },
        name: { type: "string" },
        surface,
      },
      required: [...project.required, "name", "config"],
      type: "object" as const,
    },
    list: { ...project, properties: { ...project.properties, surface } },
  };
}
