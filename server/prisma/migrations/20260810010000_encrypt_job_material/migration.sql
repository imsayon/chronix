ALTER TABLE jobs
  ADD COLUMN headers_ciphertext BYTEA,
  ADD COLUMN headers_nonce BYTEA,
  ADD COLUMN body_template_ciphertext BYTEA,
  ADD COLUMN body_template_nonce BYTEA,
  ADD COLUMN signing_secret_ciphertext BYTEA,
  ADD COLUMN signing_secret_nonce BYTEA,
  ADD COLUMN encryption_key_version SMALLINT NOT NULL DEFAULT 1;

UPDATE jobs SET headers = '{}'::jsonb, body_template = NULL;
