-- GitHub popularity is separate from the former personal rating.
-- NULL hides the count; an explicitly entered zero remains visible.
BEGIN;
ALTER TABLE items ADD COLUMN IF NOT EXISTS github_stars BIGINT
  CHECK (github_stars BETWEEN 0 AND 9007199254740991);
COMMIT;
