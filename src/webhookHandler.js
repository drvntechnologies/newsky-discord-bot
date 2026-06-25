import { EmbedBuilder } from 'discord.js';
import supabase from './supabase.js';

const EVENT_COLORS = {
  flight_create: 0xf39c12,
  flight_open: 0x3498db,
  flight_takeoff: 0x2ecc71,
  flight_landing: 0x9b59b6,
  flight_close: 0x1abc9c,
  flight_close_rating: 0x1abc9c,
  flight_cancel: 0xe74c3c,
  flight_delete: 0x95a5a6,
  flight_bad_rating: 0xe67e22,
};

const EVENT_TITLES = {
  flight_create: 'Flight Created',
  flight_open: 'Flight Opened',
  flight_takeoff: 'Takeoff',
  flight_landing: 'Landing',
  flight_close: 'Flight Closed',
  flight_close_rating: 'Flight Closed (Rated)',
  flight_cancel: 'Flight Cancelled',
  flight_delete: 'Flight Deleted',
  flight_bad_rating: 'Bad Landing Rate',
};

function extractFlightInfo(payload) {
  const flight = payload.flight || payload.data || payload;

  const flightNumber = flight.flightNumber
    || (flight.airline?.icao ? `${flight.airline.icao}${flight.flightNumber || ''}` : null)
    || flight.flight_number
    || 'Unknown';

  const pilotName = flight.pilot?.fullname
    || flight.pilot?.name
    || flight.pilot_name
    || 'Unknown Pilot';

  const depIcao = flight.dep?.icao || flight.departure_icao || flight.departure || '???';
  const arrIcao = flight.arr?.icao || flight.arrival_icao || flight.arrival || '???';
  const aircraft = flight.aircraft?.airframe?.icao || flight.aircraft_icao || flight.aircraft || null;
  const network = flight.network?.name || flight.network || null;
  const rating = flight.rating ?? flight.landingRate ?? null;
  const duration = flight.durationAct ?? flight.duration ?? null;
  const distance = flight.result?.totals?.distance ?? flight.distance ?? null;

  return { flightNumber, pilotName, depIcao, arrIcao, aircraft, network, rating, duration, distance };
}

function buildWebhookEmbed(eventType, payload) {
  const color = EVENT_COLORS[eventType] || 0x7f8c8d;
  const title = EVENT_TITLES[eventType] || eventType;
  const info = extractFlightInfo(payload);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${info.flightNumber} - ${title}`)
    .addFields(
      { name: 'Pilot', value: info.pilotName, inline: true },
      { name: 'Route', value: `${info.depIcao} -> ${info.arrIcao}`, inline: true },
    );

  if (info.aircraft) {
    embed.addFields({ name: 'Aircraft', value: info.aircraft, inline: true });
  }

  if (info.network) {
    const networkDisplay = info.network === 'vatsim' ? 'VATSIM' : info.network;
    embed.addFields({ name: 'Network', value: networkDisplay, inline: true });
  }

  if (info.rating != null && (eventType === 'flight_landing' || eventType === 'flight_close_rating' || eventType === 'flight_bad_rating')) {
    embed.addFields({ name: 'Landing Rate', value: `${info.rating} fpm`, inline: true });
  }

  if (info.duration != null && (eventType === 'flight_close' || eventType === 'flight_close_rating')) {
    const hours = Math.floor(info.duration / 60);
    const minutes = info.duration % 60;
    embed.addFields({ name: 'Duration', value: `${hours}h ${minutes}min`, inline: true });
  }

  if (info.distance != null && (eventType === 'flight_close' || eventType === 'flight_close_rating')) {
    embed.addFields({ name: 'Distance', value: `${info.distance} nm`, inline: true });
  }

  embed.setTimestamp();
  embed.setFooter({ text: `NewSky Webhook - ${eventType}` });

  return embed;
}

function detectEventType(payload) {
  if (payload.event) return payload.event;
  if (payload.type) return payload.type;
  if (payload.action) return payload.action;
  return null;
}

export async function handleWebhookEvent(payload, channel) {
  const eventType = detectEventType(payload);

  if (!eventType) {
    console.log('[Webhook] No event type detected in payload, skipping notification.');
    return;
  }

  if (!EVENT_TITLES[eventType]) {
    console.log(`[Webhook] Unknown event type: ${eventType}, skipping notification.`);
    return;
  }

  if (!channel) {
    console.log(`[Webhook] Event ${eventType} received but Discord channel not connected.`);
    return;
  }

  console.log(`[Webhook] Processing event: ${eventType}`);

  const embed = buildWebhookEmbed(eventType, payload);

  try {
    await channel.send({ embeds: [embed] });
    console.log(`[Webhook] Notification sent for ${eventType}`);
  } catch (err) {
    console.error(`[Webhook] Failed to send Discord notification:`, err.message);
  }

  // Update tracked_flights based on event
  await syncFlightState(eventType, payload);
}

async function syncFlightState(eventType, payload) {
  const info = extractFlightInfo(payload);
  const flight = payload.flight || payload.data || payload;
  const flightId = flight._id || flight.id || null;

  if (!flightId) return;

  try {
    if (eventType === 'flight_takeoff') {
      const { error } = await supabase
        .from('tracked_flights')
        .upsert({
          flight_id: flightId,
          flight_number: info.flightNumber,
          pilot_name: info.pilotName,
          departure_icao: info.depIcao,
          arrival_icao: info.arrIcao,
          aircraft_icao: info.aircraft,
          network: info.network,
          status: 'active',
          started_at: new Date().toISOString(),
          missed_polls: 0,
        }, { onConflict: 'flight_id' });

      if (error) console.error('[Webhook DB] Error upserting active flight:', error.message);
    }

    if (eventType === 'flight_landing' || eventType === 'flight_close' || eventType === 'flight_close_rating') {
      const { error } = await supabase
        .from('tracked_flights')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          notified_complete: true,
        })
        .eq('flight_id', flightId);

      if (error) console.error('[Webhook DB] Error completing flight:', error.message);
    }

    if (eventType === 'flight_cancel' || eventType === 'flight_delete') {
      const { error } = await supabase
        .from('tracked_flights')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          notified_complete: true,
        })
        .eq('flight_id', flightId);

      if (error) console.error('[Webhook DB] Error cancelling flight:', error.message);
    }

    if (eventType === 'flight_create') {
      const { error } = await supabase
        .from('booked_flights')
        .upsert({
          flight_id: flightId,
          flight_number: info.flightNumber,
          pilot_name: info.pilotName,
          departure_icao: info.depIcao,
          arrival_icao: info.arrIcao,
          aircraft_icao: info.aircraft,
          network: info.network,
          notified: true,
        }, { onConflict: 'flight_id' });

      if (error) console.error('[Webhook DB] Error upserting booked flight:', error.message);
    }
  } catch (err) {
    console.error('[Webhook DB] Unexpected error:', err.message);
  }
}
