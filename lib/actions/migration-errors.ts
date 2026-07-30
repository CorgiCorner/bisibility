// Migration token domain errors shared by the cloud actions and the ActionResult
// mapping helper. Kept out of the "use server" modules so both server and the
// shared result helper can reference the classes.

export {
  MigrationTokenAlreadyConsumedError,
  MigrationTokenNotActiveError,
} from "@/lib/migration/token-errors";
