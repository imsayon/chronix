-- Bind a refresh-token session to the selected workspace so workspace switching
-- and rotation remain explicit and tenant-safe.
ALTER TABLE refresh_tokens ADD COLUMN workspace_id UUID;

UPDATE refresh_tokens AS rt
SET workspace_id = membership.workspace_id
FROM (
  SELECT DISTINCT ON (account_id) account_id, workspace_id
  FROM workspace_memberships
  ORDER BY account_id, created_at ASC
) AS membership
WHERE membership.account_id = rt.account_id;

ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX refresh_tokens_workspace_id_idx ON refresh_tokens(workspace_id);
