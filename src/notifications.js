import { EmbedBuilder } from 'discord.js';

export function buildFlightStartedEmbed(flight) {
  const networkDisplay = flight.network === 'vatsim' ? 'VATSIM' : 'Offline';

  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`${flight.flight_number} has departed`)
    .addFields(
      { name: 'Pilot', value: flight.pilot_name, inline: true },
      { name: 'Route', value: `${flight.departure_icao} -> ${flight.arrival_icao}`, inline: true },
      { name: 'Aircraft', value: flight.aircraft_icao || 'Unknown', inline: true },
      { name: 'Network', value: networkDisplay, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'NewSky Flight Tracker' });
}

export function buildFlightCompletedEmbed(flight, recentData) {
  const networkDisplay = flight.network === 'vatsim' ? 'VATSIM' : 'Offline';

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`${flight.flight_number} has landed`)
    .addFields(
      { name: 'Pilot', value: flight.pilot_name, inline: true },
      { name: 'Route', value: `${flight.departure_icao} -> ${flight.arrival_icao}`, inline: true },
      { name: 'Aircraft', value: flight.aircraft_icao || 'Unknown', inline: true },
      { name: 'Network', value: networkDisplay, inline: true }
    );

  if (recentData) {
    if (recentData.durationAct) {
      const hours = Math.floor(recentData.durationAct / 60);
      const minutes = recentData.durationAct % 60;
      embed.addFields({ name: 'Duration', value: `${hours}h ${minutes}min`, inline: true });
    }

    if (recentData.result?.totals?.distance) {
      embed.addFields({ name: 'Distance', value: `${recentData.result.totals.distance} nm`, inline: true });
    }

    if (recentData.rating != null) {
      embed.addFields({ name: 'Landing Rate', value: `${recentData.rating} fpm`, inline: true });
    }
  }

  embed.setTimestamp();
  embed.setFooter({ text: 'NewSky Flight Tracker' });

  return embed;
}

export function buildFlightMissedEmbed(flight) {
  const networkDisplay = flight.network?.name === 'vatsim' ? 'VATSIM' : 'Offline';
  const flightNumber = `${flight.airline?.icao || ''}${flight.flightNumber || ''}`;
  const pilotName = flight.pilot?.fullname || 'Unknown Pilot';
  const depIcao = flight.dep?.icao || 'N/A';
  const arrIcao = flight.arr?.icao || 'N/A';
  const aircraftIcao = flight.aircraft?.airframe?.icao || 'Unknown';

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`${flightNumber} departed and landed while offline`)
    .addFields(
      { name: 'Pilot', value: pilotName, inline: true },
      { name: 'Route', value: `${depIcao} -> ${arrIcao}`, inline: true },
      { name: 'Aircraft', value: aircraftIcao, inline: true },
      { name: 'Network', value: networkDisplay, inline: true }
    );

  if (flight.durationAct) {
    const hours = Math.floor(flight.durationAct / 60);
    const minutes = flight.durationAct % 60;
    embed.addFields({ name: 'Duration', value: `${hours}h ${minutes}min`, inline: true });
  }

  if (flight.result?.totals?.distance) {
    embed.addFields({ name: 'Distance', value: `${flight.result.totals.distance} nm`, inline: true });
  }

  if (flight.rating != null) {
    embed.addFields({ name: 'Landing Rate', value: `${flight.rating} fpm`, inline: true });
  }

  embed.setTimestamp();
  embed.setFooter({ text: 'NewSky Flight Tracker' });

  return embed;
}

export function buildFlightBookedEmbed(flight) {
  const networkDisplay = flight.network === 'vatsim' ? 'VATSIM' : 'Offline';

  const embed = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle(`${flight.flight_number} has been booked`)
    .addFields(
      { name: 'Pilot', value: flight.pilot_name, inline: true },
      { name: 'Route', value: `${flight.departure_icao} -> ${flight.arrival_icao}`, inline: true },
      { name: 'Aircraft', value: flight.aircraft_icao || 'Unknown', inline: true },
      { name: 'Network', value: networkDisplay, inline: true }
    );

  if (flight.scheduled_departure) {
    const dep = new Date(flight.scheduled_departure);
    embed.addFields({ name: 'Scheduled', value: `<t:${Math.floor(dep.getTime() / 1000)}:R>`, inline: true });
  }

  embed.setTimestamp();
  embed.setFooter({ text: 'NewSky Flight Tracker' });

  return embed;
}
