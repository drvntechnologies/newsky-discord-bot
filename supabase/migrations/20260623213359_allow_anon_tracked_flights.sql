CREATE POLICY "anon_all" ON tracked_flights
  FOR ALL TO anon USING (true) WITH CHECK (true);