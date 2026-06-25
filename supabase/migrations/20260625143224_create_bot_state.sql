CREATE TABLE bot_state (
  id integer PRIMARY KEY DEFAULT 1,
  last_poll_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO bot_state (id, last_poll_at) VALUES (1, now());

ALTER TABLE bot_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON bot_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);