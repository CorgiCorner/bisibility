-- Prefix lookup and stable scalar sorts; aggregate sorts use indexed account joins.
CREATE INDEX "users_admin_email_prefix_idx" ON "users" (lower("email") text_pattern_ops);
CREATE INDEX "users_admin_public_id_prefix_idx" ON "users" (lower("publicId") text_pattern_ops);
CREATE INDEX "users_admin_email_sort_idx" ON "users" (lower("email"), "publicId");
CREATE INDEX "users_admin_created_sort_idx" ON "users" ("createdAt", "publicId");
CREATE INDEX "users_admin_status_sort_idx" ON "users" (("deactivatedAt" IS NOT NULL), "publicId");
CREATE INDEX "sessions_admin_last_active_idx" ON "sessions" ("userId", "updatedAt" DESC);
