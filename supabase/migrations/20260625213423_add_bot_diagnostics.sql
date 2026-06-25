
ALTER TABLE bot_state
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'starting',
  ADD COLUMN IF NOT EXISTS status_message text,
  ADD COLUMN IF NOT EXISTS discord_connected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS channel_name text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Allow anon to read bot_state for the dashboard
CREATE POLICY "anon_select_bot_state" ON bot_state FOR SELECT
  TO anon, authenticated USING (true);

-- Allow anon to update (the bot uses service_role, but just in case)
CREATE POLICY "anon_update_bot_state" ON bot_state FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
