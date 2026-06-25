CREATE TABLE booked_flights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id text UNIQUE NOT NULL,
  flight_number text NOT NULL,
  pilot_name text NOT NULL,
  departure_icao text NOT NULL,
  arrival_icao text NOT NULL,
  aircraft_icao text,
  network text,
  scheduled_departure timestamptz,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE booked_flights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON booked_flights
  FOR ALL TO service_role USING (true) WITH CHECK (true);