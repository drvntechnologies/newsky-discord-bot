/*
# Create webhook_logs table

Stores raw webhook payloads from NewSky for inspection and debugging.
Since NewSky provides no webhook documentation, this table captures
every incoming request so we can understand the payload structure.

1. New Tables
  - `webhook_logs`
    - `id` (bigint, auto-incrementing primary key)
    - `received_at` (timestamptz, when the webhook arrived)
    - `method` (text, HTTP method used)
    - `headers` (jsonb, full request headers)
    - `body` (jsonb, full request body)
    - `query_params` (jsonb, any URL query parameters)

2. Security
  - Enable RLS on `webhook_logs`.
  - Allow anon + authenticated full CRUD (single-tenant bot, no user auth).
*/

CREATE TABLE IF NOT EXISTS webhook_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL,
  headers jsonb,
  body jsonb,
  query_params jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_webhook_logs" ON webhook_logs;
CREATE POLICY "anon_select_webhook_logs" ON webhook_logs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_webhook_logs" ON webhook_logs;
CREATE POLICY "anon_insert_webhook_logs" ON webhook_logs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_webhook_logs" ON webhook_logs;
CREATE POLICY "anon_update_webhook_logs" ON webhook_logs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_webhook_logs" ON webhook_logs;
CREATE POLICY "anon_delete_webhook_logs" ON webhook_logs FOR DELETE
  TO anon, authenticated USING (true);