import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { poll, pollBookings, updateLastPollAt, catchUp } from './src/poller.js';
import { createServer, setDiscordChannel, setDiscordClient } from './src/server.js';

const POLL_INTERVAL_MS = 60_000;
const PORT = process.env.PORT || 3000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

setDiscordClient(client);

let pollInterval = null;

const app = createServer();
app.listen(PORT, () => {
  console.log(`[Web] Admin dashboard running at http://localhost:${PORT}`);
});

async function connectChannel() {
  let channel;
  try {
    channel = await client.channels.fetch(process.env.CHANNEL_ID);
  } catch (err) {
    console.error(`[Bot] Cannot access channel ${process.env.CHANNEL_ID}: ${err.message}`);
    return null;
  }
  if (!channel || !channel.isTextBased()) {
    console.error(`[Bot] Channel ${process.env.CHANNEL_ID} is not a text channel.`);
    return null;
  }
  setDiscordChannel(channel);
  return channel;
}

client.on('ready', async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);

  const channel = await connectChannel();
  if (!channel) return;

  console.log(`[Bot] Posting notifications to #${channel.name}`);
  console.log(`[Bot] Polling every ${POLL_INTERVAL_MS / 1000}s...`);

  await catchUp(channel);

  poll(channel);
  pollBookings(channel);
  pollInterval = setInterval(async () => {
    poll(channel);
    pollBookings(channel);
    await updateLastPollAt();
  }, POLL_INTERVAL_MS);
});

client.on('shardResume', async () => {
  console.log('[Bot] Connection resumed, re-fetching channel...');
  await connectChannel();
});

client.on('shardReconnecting', () => {
  console.log('[Bot] Reconnecting to Discord...');
  setDiscordChannel(null);
});

client.on('shardDisconnect', (event) => {
  console.error(`[Bot] Disconnected from Discord (code ${event.code})`);
  setDiscordChannel(null);
});

client.on('error', (err) => {
  console.error('[Bot] Client error:', err.message);
});

function shutdown() {
  console.log('[Bot] Shutting down...');
  if (pollInterval) clearInterval(pollInterval);
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(process.env.BOT_TOKEN).catch((err) => {
  console.error(`[Bot] Failed to login: ${err.message}`);
  console.log('[Web] Dashboard still running without Discord connection.');
});
