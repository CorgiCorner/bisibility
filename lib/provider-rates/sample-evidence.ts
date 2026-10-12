import { Prisma } from "@/lib/generated/prisma/client";

/** Cost histories follow the current credential source; own-key samples also need owner proof. */
export const providerRateSampleEvidence = Prisma.sql`
  e."measurementStatus" = 'recorded'
  AND EXISTS (
    SELECT 1 FROM provider_connections connection
    JOIN projects project ON project.id = connection."projectId"
    WHERE connection.id = e."connectionId"
      AND project.id = e."projectId"
      AND connection.provider = e.provider
      AND connection."credentialSource"::text = e."credentialSource"
      AND (e."credentialSource" = 'hosted' OR project."ownerId" = e.principal)
  )`;
