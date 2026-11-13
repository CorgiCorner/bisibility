import { type AuditPayloadPolicy, auditFields as f } from "./audit-payload-policy";

type Declare = (actions: readonly string[], policy?: AuditPayloadPolicy) => void;

export function registerAiSourceAuditDeclarations(declare: Declare) {
  const sourceType = f.strings("domain", "type");
  const plan = { ...f.strings("domain", "note", "state"), ...f.urls("url") };
  declare(["ai_source.type.set", "ai_source.type.clear"], {
    after: sourceType,
    before: sourceType,
  });
  declare(["ai_source.plan.add", "ai_source.plan.update", "ai_source.plan.remove"], {
    after: plan,
    before: plan,
  });
}

export function registerAiTrackingAuditDeclarations(declare: Declare) {
  declare(
    [
      "ai_tracking.topic.create",
      "ai_tracking.topic.update",
      "ai_tracking.topic.archive",
      "ai_tracking.topic.pause",
      "ai_tracking.topic.resume",
      "ai_tracking.prompt.create",
      "ai_tracking.prompt.update",
      "ai_tracking.prompt.archive",
      "ai_tracking.prompt.pause",
      "ai_tracking.prompt.resume",
      "ai_tracking.schedule.create",
      "ai_tracking.schedule.update",
      "ai_tracking.schedule.archive",
      "ai_tracking.schedule.enable",
      "ai_tracking.schedule.disable",
      "ai_tracking.run.launch",
      "ai_tracking.run.cancel",
      "ai_tracking.run.retry",
      "ai_tracking.suggestions.generate",
    ],
    { after: f.strings("resourceId") },
  );
  declare(
    ["ai_tracking.schedule.consent", "ai_tracking.run.consent", "ai_tracking.suggestions.consent"],
    {
      after: { ...f.strings("resourceId"), ...f.booleans("consent") },
    },
  );
  declare(["ai_tracking.suggestions.accept"], { after: f.numbers("count") });
  const engineChoice = { ...f.booleans("enabled"), ...f.strings("engine", "source") };
  declare(["ai_tracking.engine.enable", "ai_tracking.engine.disable"], {
    after: engineChoice,
    before: engineChoice,
  });
}
