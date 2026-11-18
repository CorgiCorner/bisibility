-- An archived intent is a non-scheduled revision: snapshot, digest, capability version and schedule id stay null.
SELECT set_config('search_path', format('%I, pg_temp', current_schema()), false);
ALTER TABLE local_monitor_schedule_intents DROP CONSTRAINT local_monitor_schedule_intents_mode_check, ADD CONSTRAINT local_monitor_schedule_intents_mode_check CHECK (mode IN ('manual','paused','scheduled','archived'));
