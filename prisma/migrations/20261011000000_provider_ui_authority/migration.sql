-- Initialize authority for installations that already applied provider UI commands.
INSERT INTO "provider_ui_authority" ("id", "instanceId")
VALUES ('provider-ui', gen_random_uuid()::text)
ON CONFLICT ("id") DO NOTHING;
