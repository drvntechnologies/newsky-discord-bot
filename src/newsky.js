const API_BASE = 'https://newsky.app/api/airline-api';

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.NEWSKY_API_TOKEN}`,
  };
}

export async function fetchOngoingFlights() {
  try {
    const response = await fetch(`${API_BASE}/flights/ongoing`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) {
      console.error(`[NewSky] Failed to fetch ongoing flights: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('[NewSky] Error fetching ongoing flights:', error.message);
    return null;
  }
}

export async function fetchRecentFlights(startDate) {
  try {
    const response = await fetch(`${API_BASE}/flights/recent`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ start: startDate.toISOString() }),
    });

    if (!response.ok) {
      console.error(`[NewSky] Failed to fetch recent flights: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('[NewSky] Error fetching recent flights:', error.message);
    return null;
  }
}

const BOOKED_STATUSES = ['booked', 'assigned', 'scheduled', 'pending'];

export async function fetchBookedFlights() {
  try {
    const lookback = new Date();
    lookback.setHours(lookback.getHours() - 2);

    const response = await fetch(`${API_BASE}/flights/recent`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ start: lookback.toISOString() }),
    });

    if (!response.ok) {
      console.error(`[NewSky] Failed to fetch booked flights: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const all = data.results || [];
    return all.filter((f) => {
      const status = (f.status || '').toLowerCase();
      return BOOKED_STATUSES.includes(status);
    });
  } catch (error) {
    console.error('[NewSky] Error fetching booked flights:', error.message);
    return null;
  }
}
