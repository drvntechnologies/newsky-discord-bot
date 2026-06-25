CREATE POLICY "anon_all" ON booked_flights
  FOR ALL TO anon USING (true) WITH CHECK (true);