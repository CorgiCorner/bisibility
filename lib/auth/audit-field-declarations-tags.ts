import { type AuditPayloadPolicy, auditFields as f } from "@/lib/auth/audit-payload-policy";

type Declare = (actions: readonly string[], policy?: AuditPayloadPolicy) => void;

export function registerTagAuditDeclarations(declare: Declare) {
  declare(["tag.create"], { after: f.strings("name") });
  declare(["page_snapshot.take"], {
    after: {
      ...f.strings("source", "takenOn"),
      ...f.numbers("pageCount"),
      ...f.booleans("replaced"),
    },
  });
  declare(["tag.page_links.remove"], {
    after: { ...f.booleans("ruleRemoved"), ...f.numbers("pages") },
    before: f.strings("name"),
  });
  declare(["tag.page_links.set"], {
    after: { ...f.strings("name"), ...f.numbers("added", "removed") },
  });
  declare(["tag.page_rule.save"], {
    after: {
      ...f.strings("kind", "name"),
      ...f.booleans("autoJoin", "created", "tagTargetingKeywords"),
      ...f.numbers("keywordsTagged", "pagesAdded", "pagesRemoved"),
    },
  });
  declare(["tag.delete"], { before: { ...f.strings("name"), ...f.numbers("count") } });
  declare(["tag.merge"], {
    after: {
      ...f.strings("name"),
      ...f.booleans("ruleMoved"),
      ...f.numbers("alerts", "keywordSegments", "keywords", "pages", "savedViews"),
    },
    before: f.strings("name"),
  });
  declare(["tag.rename"], {
    after: { ...f.strings("name"), ...f.numbers("count"), ...f.booleans("merged") },
    before: f.strings("name"),
  });
}
