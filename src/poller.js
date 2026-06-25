import supabase from './supabase.js';
import { fetchOngoingFlights, fetchRecentFlights, fetchBookedFlights } from './newsky.js';
import { buildFlightStartedEmbed, buildFlightCompletedEmbed, buildFlightBookedEmbed, buildFlightMissedEmbed } from './notifications.js';

const MISSED_POLLS_THRESHOLD = 3;
const MIN_FLIGHT_AGE_MS = 30 * 60 * 1000;

function extractFlightId(flight) {
  return flight._id || flight.id || `${flight.flightNumber}-${flight.pilot?.fullname}`;
}

function mapApiFlightToRecord(flight) {
  return {
    flight_id: extractFlightId(flight),
    flight_number: `${flight.airline?.icao || ''}${flight.flightNumber || ''}`,
    pilot_name: flight.pilot?.fullname || 'Unknown Pilot',
    departure_icao: flight.dep?.icao || 'N/A',
    arrival_icao: flight.arr?.icao || 'N/A',
    aircraft_icao: flight.aircraft?.airframe?.icao || null,
    network: flight.network?.name || null,
    status: 'active',
    started_at: flight.depTimeAct || new Date().toISOString(),
  };
}

async function getActiveFlightsFromDb() {
  const { data, error } = await supabase
    .from('tracked_flights')
    .select('*')
    .eq('status', 'active');

  if (error) {
    console.error('[DB] Error fetching active flights:', error.message);
    return [];
  }
  return data || [];
}

async function insertFlight(record) {
  const { error } = await supabase
    .from('tracked_flights')
    .insert(record);

  if (error) {
    console.error('[DB] Error inserting flight:', error.message);
    return false;
  }
  return true;
}

async function markFlightCompleted(flightId) {
  const { error } = await supabase
    .from('tracked_flights')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      notified_complete: true,
      missed_polls: 0,
    })
    .eq('flight_id', flightId);

  if (error) {
    console.error('[DB] Error updating flight:', error.message);
  }
}

async function incrementMissedPolls(flightId, currentCount) {
  const { error } = await supabase
    .from('tracked_flights')
    .update({ missed_polls: currentCount + 1 })
    .eq('flight_id', flightId);

  if (error) {
    console.error('[DB] Error incrementing missed_polls:', error.message);
  }
}

async function resetMissedPolls(flightId) {
  const { error } = await supabase
    .from('tracked_flights')
    .update({ missed_polls: 0 })
    .eq('flight_id', flightId);

  if (error) {
    console.error('[DB] Error resetting missed_polls:', error.message);
  }
}

async function lookupRecentFlightData(flight) {
  const lookbackDate = new Date();
  lookbackDate.setHours(lookbackDate.getHours() - 6);

  const recentFlights = await fetchRecentFlights(lookbackDate);
  if (!recentFlights) return null;

  const match = recentFlights.find((rf) => {
    const rfNumber = `${rf.airline?.icao || ''}${rf.flightNumber || ''}`;
    const pilotMatch = rf.pilot?.fullname === flight.pilot_name;
    const numberMatch = rfNumber === flight.flight_number;
    return pilotMatch || numberMatch;
  });

  return match || null;
}

export async function poll(channel) {
  const ongoingFlights = await fetchOngoingFlights();
  if (ongoingFlights === null) return;

  const dbActiveFlights = await getActiveFlightsFromDb();
  const ongoingIds = new Set(ongoingFlights.map(extractFlightId));
  const dbActiveIds = new Set(dbActiveFlights.map((f) => f.flight_id));

  // Detect new flights (in API but not in DB)
  for (const flight of ongoingFlights) {
    const flightId = extractFlightId(flight);
    if (!dbActiveIds.has(flightId)) {
      const record = mapApiFlightToRecord(flight);
      const inserted = await insertFlight(record);
      if (inserted) {
        console.log(`[Flight Started] ${record.flight_number} - ${record.pilot_name}`);
        const embed = buildFlightStartedEmbed(record);
        await channel.send({ embeds: [embed] });
      }
    }
  }

  // Reset missed_polls for flights that are still ongoing
  for (const dbFlight of dbActiveFlights) {
    if (ongoingIds.has(dbFlight.flight_id) && dbFlight.missed_polls > 0) {
      await resetMissedPolls(dbFlight.flight_id);
      console.log(`[Flight Recovered] ${dbFlight.flight_number} - back in API after ${dbFlight.missed_polls} missed poll(s)`);
    }
  }

  // Detect completed flights (in DB but not in API) with grace period
  for (const dbFlight of dbActiveFlights) {
    if (!ongoingIds.has(dbFlight.flight_id)) {
      const flightAge = Date.now() - new Date(dbFlight.started_at).getTime();
      const missedCount = (dbFlight.missed_polls || 0) + 1;

      if (flightAge < MIN_FLIGHT_AGE_MS) {
        await incrementMissedPolls(dbFlight.flight_id, dbFlight.missed_polls || 0);
        console.log(`[Flight Missing ${missedCount}/${MISSED_POLLS_THRESHOLD}] ${dbFlight.flight_number} - too young to complete (${Math.round(flightAge / 1000)}s old)`);
        continue;
      }

      if (missedCount < MISSED_POLLS_THRESHOLD) {
        await incrementMissedPolls(dbFlight.flight_id, dbFlight.missed_polls || 0);
        console.log(`[Flight Missing ${missedCount}/${MISSED_POLLS_THRESHOLD}] ${dbFlight.flight_number} - ${dbFlight.pilot_name}`);
        continue;
      }

      const recentData = await lookupRecentFlightData(dbFlight);
      await markFlightCompleted(dbFlight.flight_id);
      console.log(`[Flight Completed] ${dbFlight.flight_number} - ${dbFlight.pilot_name}`);
      const embed = buildFlightCompletedEmbed(dbFlight, recentData);
      await channel.send({ embeds: [embed] });
    }
  }
}

function extractBookedFlightId(flight) {
  return flight._id || flight.id || `${flight.flightNumber}-${flight.pilot?.fullname}`;
}

function mapBookedFlightToRecord(flight) {
  return {
    flight_id: extractBookedFlightId(flight),
    flight_number: `${flight.airline?.icao || ''}${flight.flightNumber || ''}`,
    pilot_name: flight.pilot?.fullname || 'Unknown Pilot',
    departure_icao: flight.dep?.icao || 'N/A',
    arrival_icao: flight.arr?.icao || 'N/A',
    aircraft_icao: flight.aircraft?.airframe?.icao || null,
    network: flight.network?.name || null,
    scheduled_departure: flight.depTimeSch || null,
    notified: true,
  };
}

export async function pollBookings(channel) {
  const bookedFlights = await fetchBookedFlights();
  if (bookedFlights === null) return;

  if (bookedFlights.length === 0) return;

  const bookedIds = bookedFlights.map(extractBookedFlightId);
  const { data: existing } = await supabase
    .from('booked_flights')
    .select('flight_id')
    .in('flight_id', bookedIds);

  const existingIds = new Set((existing || []).map((r) => r.flight_id));

  for (const flight of bookedFlights) {
    const flightId = extractBookedFlightId(flight);
    if (existingIds.has(flightId)) continue;

    const record = mapBookedFlightToRecord(flight);
    const { error } = await supabase
      .from('booked_flights')
      .insert(record);

    if (error) {
      console.error('[DB] Error inserting booked flight:', error.message);
      continue;
    }

    console.log(`[Flight Booked] ${record.flight_number} - ${record.pilot_name}`);
    const embed = buildFlightBookedEmbed(record);
    await channel.send({ embeds: [embed] });
  }
}

export async function updateLastPollAt() {
  const { error } = await supabase
    .from('bot_state')
    .update({ last_poll_at: new Date().toISOString() })
    .eq('id', 1);

  if (error) {
    console.error('[DB] Error updating last_poll_at:', error.message);
  }
}

const COMPLETED_STATUSES = ['arrived', 'completed', 'done'];

export async function catchUp(channel) {
  const { data, error } = await supabase
    .from('bot_state')
    .select('last_poll_at')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) {
    console.log('[CatchUp] No last_poll_at found, skipping catch-up.');
    return;
  }

  const lastPoll = new Date(data.last_poll_at);
  const downtime = Date.now() - lastPoll.getTime();

  if (downtime < 2 * 60 * 1000) {
    console.log('[CatchUp] Downtime < 2 min, skipping catch-up.');
    return;
  }

  console.log(`[CatchUp] Bot was offline for ${Math.round(downtime / 60000)} minutes. Checking for missed flights...`);

  const recentFlights = await fetchRecentFlights(lastPoll);
  if (!recentFlights || recentFlights.length === 0) {
    console.log('[CatchUp] No recent flights found during downtime.');
    return;
  }

  const completedFlights = recentFlights.filter((f) => {
    const status = (f.status || '').toLowerCase();
    return COMPLETED_STATUSES.includes(status);
  });

  if (completedFlights.length === 0) {
    console.log('[CatchUp] No completed flights during downtime.');
    return;
  }

  const flightIds = completedFlights.map(extractFlightId);
  const { data: alreadyTracked } = await supabase
    .from('tracked_flights')
    .select('flight_id')
    .in('flight_id', flightIds);

  const trackedIds = new Set((alreadyTracked || []).map((r) => r.flight_id));

  let missedCount = 0;
  for (const flight of completedFlights) {
    const flightId = extractFlightId(flight);
    if (trackedIds.has(flightId)) continue;

    const record = mapApiFlightToRecord(flight);
    record.status = 'completed';
    record.completed_at = new Date().toISOString();
    record.notified_complete = true;

    const { error: insertErr } = await supabase
      .from('tracked_flights')
      .insert(record);

    if (insertErr) {
      console.error('[CatchUp] Error inserting missed flight:', insertErr.message);
      continue;
    }

    missedCount++;
    console.log(`[CatchUp] Missed flight: ${record.flight_number} - ${record.pilot_name}`);
    const embed = buildFlightMissedEmbed(flight);
    await channel.send({ embeds: [embed] });
  }

  console.log(`[CatchUp] Recovered ${missedCount} missed flight(s).`);
}
