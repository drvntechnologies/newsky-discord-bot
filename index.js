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

client.on('ready', async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);

  let channel;
  try {
    channel = await client.channels.fetch(process.env.CHANNEL_ID);
  } catch (err) {
    console.error(`[Bot] Cannot access channel ${process.env.CHANNEL_ID}: ${err.message}`);
    console.error('[Bot] Ensure the bot has View Channel permission and the ID is a text channel.');
    return;
  }

  if (!channel || !channel.isTextBased()) {
    console.error(`[Bot] Channel ${process.env.CHANNEL_ID} is not a text channel.`);
    return;
  }

  setDiscordChannel(channel);

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
