ALTER TABLE "notifications" ADD COLUMN "legacyProjectQuarantinedAt" TIMESTAMP(3);

-- Old application versions delete incidents before deleting the project. Remember
-- that within the transaction so the project delete can fail and roll it back.
CREATE FUNCTION notification_incident_delete_guard() RETURNS trigger AS $$
BEGIN
  IF OLD."projectId" IS NOT NULL AND OLD.type = 'provider_incident' THEN
    PERFORM set_config('bisibility.deleted_incident_projects',
      (COALESCE(NULLIF(current_setting('bisibility.deleted_incident_projects', true), ''), '{}')::jsonb
        || jsonb_build_object(OLD."projectId", true))::text, true);
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER notification_incident_delete_guard BEFORE DELETE ON "notifications"
  FOR EACH ROW EXECUTE FUNCTION notification_incident_delete_guard();

CREATE FUNCTION retain_project_notifications_on_delete() RETURNS trigger AS $$
BEGIN
  IF COALESCE(NULLIF(current_setting('bisibility.deleted_incident_projects', true), ''), '{}')::jsonb ? OLD.id
    AND NOT COALESCE(NULLIF(current_setting('bisibility.retained_notification_projects', true), ''), '{}')::jsonb ? OLD.id THEN
    RAISE EXCEPTION 'Project deletion requires notification retention';
  END IF;
  UPDATE "notifications" SET "withdrawnAt" = clock_timestamp(), version = version + 1
    WHERE "projectId" = OLD.id AND "withdrawnAt" IS NULL;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER retain_project_notifications_on_delete BEFORE DELETE ON "projects"
  FOR EACH ROW EXECUTE FUNCTION retain_project_notifications_on_delete();
