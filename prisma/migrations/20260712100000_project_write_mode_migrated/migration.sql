-- Add the terminal "migrated" write mode: the source project stays disabled
-- after a completed instance migration until it is explicitly reactivated.
ALTER TYPE "ProjectWriteMode" ADD VALUE IF NOT EXISTS 'migrated';
