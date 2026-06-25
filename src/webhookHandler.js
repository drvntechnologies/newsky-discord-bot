function sanitizeEmbeds(embeds) {
  return embeds.map((embed) => {
    if (!embed.fields) return embed;
    return {
      ...embed,
      fields: embed.fields.map((field) => ({
        ...field,
        value: field.value || '\u200B',
      })),
    };
  });
}

export async function handleWebhookEvent(payload, channel) {
  if (!payload || !payload.embeds || !Array.isArray(payload.embeds)) {
    console.log('[Webhook] Payload has no embeds array, skipping.');
    return;
  }

  if (!channel) {
    console.log('[Webhook] Discord channel not connected, cannot forward embed.');
    return;
  }

  const embeds = sanitizeEmbeds(payload.embeds);

  try {
    await channel.send({ embeds });
    console.log(`[Webhook] Forwarded embed to Discord: ${embeds[0]?.title || 'untitled'}`);
  } catch (err) {
    console.error('[Webhook] Failed to send to Discord:', err.message);
  }
}
