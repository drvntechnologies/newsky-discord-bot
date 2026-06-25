import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { poll, pollBookings, updateLastPollAt, catchUp } from './src/poller.js';
import { createServer, setDiscordChannel, setDiscordClient } from './src/server.js';
import supabase from './src/supabase.js';

const POLL_INTERVAL_MS = 60_000;
const PORT = process.env.PORT || 3000;

async function updateBotStatus(status, message, connected, channelName) {
  const { error } = await supabase
    .from('bot_state')
    .update({
      status,
      status_message: message,
      discord_connected: connected,
      channel_name: channelName || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);
  if (error) console.error('[Status] DB write failed:', error.message);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

setDiscordClient(client);

let pollInterval = null;

const app = createServer();
app.listen(PORT, () => {
  console.log(`[Web] Admin dashboard running at http://localhost:${PORT}`);
});

// Log env check at startup
const hasToken = !!process.env.BOT_TOKEN;
const hasChannel = !!process.env.CHANNEL_ID;
console.log(`[Boot] BOT_TOKEN set: ${hasToken}, CHANNEL_ID set: ${hasChannel}`);
updateBotStatus('starting', `Token: ${hasToken ? 'yes' : 'MISSING'}, Channel ID: ${hasChannel ? 'yes' : 'MISSING'}`, false, null);

async function connectChannel() {
  let channel;
  try {
    channel = await client.channels.fetch(process.env.CHANNEL_ID);
  } catch (err) {
    const msg = `Cannot fetch channel ${process.env.CHANNEL_ID}: ${err.message}`;
    console.error(`[Bot] ${msg}`);
    await updateBotStatus('error', msg, false, null);
    return null;
  }
  if (!channel || !channel.isTextBased()) {
    const msg = `Channel ${process.env.CHANNEL_ID} is not a text channel`;
    console.error(`[Bot] ${msg}`);
    await updateBotStatus('error', msg, false, null);
    return null;
  }
  setDiscordChannel(channel);
  await updateBotStatus('connected', `Logged in, posting to #${channel.name}`, true, channel.name);
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
  updateBotStatus('reconnecting', 'WebSocket reconnecting...', false, null);
});

client.on('shardDisconnect', (event) => {
  console.error(`[Bot] Disconnected from Discord (code ${event.code})`);
  setDiscordChannel(null);
  updateBotStatus('disconnected', `WebSocket closed (code ${event.code})`, false, null);
});

client.on('error', (err) => {
  console.error('[Bot] Client error:', err.message);
  updateBotStatus('error', `Client error: ${err.message}`, false, null);
});

function shutdown() {
  console.log('[Bot] Shutting down...');
  if (pollInterval) clearInterval(pollInterval);
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(process.env.BOT_TOKEN).catch(async (err) => {
  console.error(`[Bot] Failed to login: ${err.message}`);
  await updateBotStatus('login_failed', `Login failed: ${err.message}`, false, null);
  console.log('[Web] Dashboard still running without Discord connection.');
});
