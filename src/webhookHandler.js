import supabase from './supabase.js';

export async function handleWebhookEvent(payload, channel) {
  if (!payload || !payload.embeds || !Array.isArray(payload.embeds)) {
    console.log('[Webhook] Payload has no embeds array, skipping.');
    return;
  }

  if (!channel) {
    console.log('[Webhook] Discord channel not connected, cannot forward embed.');
    return;
  }

  try {
    await channel.send({ embeds: payload.embeds });
    console.log(`[Webhook] Forwarded embed to Discord: ${payload.embeds[0]?.title || 'untitled'}`);
  } catch (err) {
    console.error('[Webhook] Failed to send to Discord:', err.message);
  }
}
