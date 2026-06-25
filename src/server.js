import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import supabase from './supabase.js';
import { handleWebhookEvent } from './webhookHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ADMIN_PASSWORD = 'teddy123';

let discordChannel = null;
let discordClient = null;

export function setDiscordChannel(channel) {
  discordChannel = channel;
}

export function setDiscordClient(client) {
  discordClient = client;
}

async function getChannel() {
  if (discordChannel) return discordChannel;
  if (discordClient && process.env.CHANNEL_ID) {
    try {
      const ch = await discordClient.channels.fetch(process.env.CHANNEL_ID);
      if (ch && ch.isTextBased()) {
        discordChannel = ch;
        return ch;
      }
    } catch (_) {}
  }
  return null;
}

export function createServer() {
  const app = express();
  app.use(express.json());

  function requireAuth(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (token !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.get('/api/flights', requireAuth, async (req, res) => {
    const status = req.query.status;
    let query = supabase
      .from('tracked_flights')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.limit(200);

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json(data);
  });

  app.get('/api/bookings', requireAuth, async (_req, res) => {
    const { data, error } = await supabase
      .from('booked_flights')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json(data);
  });

  app.get('/api/stats', requireAuth, async (_req, res) => {
    const { count: activeCount, error: e1 } = await supabase
      .from('tracked_flights')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: completedCount, error: e2 } = await supabase
      .from('tracked_flights')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed');

    const { count: bookedCount, error: e3 } = await supabase
      .from('booked_flights')
      .select('*', { count: 'exact', head: true });

    if (e1 || e2 || e3) {
      return res.status(500).json({ error: (e1 || e2 || e3).message });
    }

    res.json({
      active_count: activeCount ?? 0,
      completed_count: completedCount ?? 0,
      booked_count: bookedCount ?? 0,
      channel_connected: !!(await getChannel()),
      channel_name: discordChannel?.name || null,
    });
  });

  // NewSky webhook receiver — logs and processes incoming events
  app.post('/api/webhook/newsky', async (req, res) => {
    const logEntry = {
      method: req.method,
      headers: req.headers,
      body: req.body,
      query_params: req.query,
    };

    console.log('[Webhook] Received payload from NewSky:');
    console.log(JSON.stringify(logEntry, null, 2));

    const { error } = await supabase
      .from('webhook_logs')
      .insert(logEntry);

    if (error) {
      console.error('[Webhook] Error saving log:', error.message);
    }

    // Process the event and send Discord notification
    const channel = await getChannel();
    await handleWebhookEvent(req.body, channel);

    res.status(200).json({ received: true });
  });

  // Also accept GET in case NewSky sends a verification ping
  app.get('/api/webhook/newsky', (req, res) => {
    console.log('[Webhook] GET ping received:', JSON.stringify(req.query));
    res.status(200).json({ status: 'ok', message: 'Webhook endpoint active' });
  });

  // Webhook logs viewer (auth-protected)
  app.get('/api/webhook-logs', requireAuth, async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    const { data, error } = await supabase
      .from('webhook_logs')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json(data);
  });

  // Resend a webhook log payload to Discord
  app.post('/api/webhook-logs/:id/resend', requireAuth, async (req, res) => {
    const channel = await getChannel();
    if (!channel) {
      return res.status(503).json({ error: 'Discord channel not connected yet' });
    }

    const { data: log, error } = await supabase
      .from('webhook_logs')
      .select('body')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    if (!log) {
      return res.status(404).json({ error: 'Log entry not found' });
    }

    try {
      await handleWebhookEvent(log.body, channel);
      res.json({ success: true, message: 'Notification resent to Discord' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/test-notification', requireAuth, async (_req, res) => {
    const channel = await getChannel();
    if (!channel) {
      return res.status(503).json({ error: 'Discord channel not connected yet' });
    }

    try {
      await channel.send({
        embeds: [{
          color: 0xf39c12,
          title: 'Test Notification',
          description: 'This is a test message from the admin dashboard. The bot is alive and the channel is reachable.',
          timestamp: new Date().toISOString(),
          footer: { text: 'NewSky Flight Tracker - Admin Test' },
        }],
      });
      res.json({ success: true, message: 'Test notification sent' });
    } catch (err) {
      const hint = err.code === 50001
        ? ' (Bot lacks Send Messages / Embed Links permission in this channel)'
        : '';
      res.status(500).json({ error: err.message + hint });
    }
  });

  return app;
}
