import {
  type ButtonInteraction,
  type TextChannel,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  Routes,
} from "discord.js";
import {
  infoContainer,
  successContainer,
  errorContainer,
  dangerButton,
  secondaryButton,
  row,
  v2Reply,
  v2EphemeralReply,
} from "../v2/index";
import { logger } from "../../lib/logger";
import { ticketStore } from "../ticketStore";
import { giveawayByChannel, giveawayStore } from "../giveawayStore";
import { buildGiveawayComponents } from "../commands/sorteio";

const TICKET_EMOJI = "<:ticket:1508274275730063360>";

// Channel where ticket ratings are sent (Beamse server)
const RATING_CHANNEL_ID = "1537975632653197403";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function starLabel(stars: number): string {
  const STAR = "<a:estrela:1508926292513521837>";
  return STAR.repeat(stars);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}


// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const [ns, action] = parts;

  try {
    if (ns === "ticket") {
      await handleTicketButton(interaction, action!, parts);
    } else if (ns === "sorteio" && action === "entrar") {
      await handleGiveawayJoin(interaction, parts);
    } else {
      logger.warn({ customId: interaction.customId }, "Unknown button interaction");
    }
  } catch (err) {
    logger.error({ err, customId: interaction.customId }, "Button handler error");
    const fallback = v2EphemeralReply([errorContainer("An error occurred while processing this action.")]);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(fallback).catch(() => null);
    } else {
      await interaction.reply(fallback).catch(() => null);
    }
  }
}

async function handleTicketButton(
  interaction: ButtonInteraction,
  action: string,
  parts: string[]
) {
  const guild = interaction.guild;
  if (!guild) return;

  if (action === "confirm_close") {
    const channel = interaction.channel as TextChannel;
    if (!channel.name.startsWith("ticket-")) {
      await interaction.reply(v2EphemeralReply([errorContainer("This channel is not a ticket.")]));
      return;
    }


    const closeTime = Math.floor((Date.now() + 30_000) / 1000);

    await interaction.reply(
      v2Reply([
        infoContainer({
          title: `${TICKET_EMOJI} Closing Ticket...`,
          description: [
            `This ticket will be closed <t:${closeTime}:R>.`,
            "",
            "Thank you for reaching out to our team!",
          ].join("\n"),
        }),
      ])
    );

    // Parse opener/claimer from channel topic (format: "openerId" or "openerId:claimerId")
    const topic = channel.topic ?? "";
    const [openerId, claimerId] = topic.split(":");

    if (openerId && claimerId) {
      const meta = ticketStore.get(channel.id);

      const STAR = { name: "estrela", id: "1508926292513521837", animated: true };
      const thumbTicket = meta?.thumbnailUrl;

      // Rating card for the opener
      const btn1O = new ButtonBuilder().setCustomId(`ticket:rate:1:${claimerId}:${openerId}`).setLabel("1").setEmoji(STAR).setStyle(ButtonStyle.Secondary);
      const btn2O = new ButtonBuilder().setCustomId(`ticket:rate:2:${claimerId}:${openerId}`).setLabel("2").setEmoji(STAR).setStyle(ButtonStyle.Secondary);
      const btn3O = new ButtonBuilder().setCustomId(`ticket:rate:3:${claimerId}:${openerId}`).setLabel("3").setEmoji(STAR).setStyle(ButtonStyle.Secondary);

      await channel.send({
        content: `<@${openerId}>`,
        allowedMentions: { users: [openerId] },
      });

      await channel.send({
        ...v2Reply(
          [
            infoContainer({
              title: "Service Rating",
              description: `What rating would you give to <@${claimerId}>'s service?`,
              avatarUrl: thumbTicket,
            }),
          ],
          { buttons: [row(btn1O, btn2O, btn3O)] }
        ),
      });
    }

    setTimeout(async () => {
      await channel.delete("Ticket closed").catch(() => null);
    }, 30_000);
  } else if (action === "cancel_close") {
    await interaction.reply(
      v2EphemeralReply([successContainer("Cancelled", "Ticket closing was cancelled.")])
    );
  } else if (action === "cancel_user") {
    const channel = interaction.channel as TextChannel;
    if (!channel.name.startsWith("ticket-")) {
      await interaction.reply(v2EphemeralReply([errorContainer("This channel is not a ticket.")]));
      return;
    }

    const btnConfirm = dangerButton("ticket:confirm_cancel_user", "Yes, cancel");
    const btnBack = secondaryButton("ticket:cancel_close", "Go back");

    await interaction.reply(
      v2Reply(
        [
          infoContainer({
            title: "Cancel Ticket",
            description:
              "Are you sure you want to cancel this ticket?\nThe channel will be removed.",
          }),
        ],
        { buttons: [row(btnConfirm, btnBack)], ephemeral: true }
      )
    );
  } else if (action === "confirm_cancel_user") {
    const channel = interaction.channel as TextChannel;
    if (!channel.name.startsWith("ticket-")) {
      await interaction.reply(v2EphemeralReply([errorContainer("This channel is not a ticket.")]));
      return;
    }

    await interaction.reply(
      v2Reply([
        infoContainer({
          title: "Ticket Cancelled",
          description: "This ticket was cancelled by the user. The channel will be removed in **5 seconds**.",
        }),
      ])
    );

    setTimeout(async () => {
      await channel.delete("Ticket cancelled").catch(() => null);
    }, 5_000);
  } else if (action === "claim") {
    const channel = interaction.channel as TextChannel;
    if (!channel.name.startsWith("ticket-")) {
      await interaction.reply(v2EphemeralReply([errorContainer("This channel is not a ticket.")]));
      return;
    }

    // Check if already claimed
    const topicRaw = channel.topic ?? "";
    if (topicRaw.includes(":")) {
      const existingClaimerId = topicRaw.split(":")[1];
      await interaction.reply(
        v2EphemeralReply([
          errorContainer(`This ticket has already been claimed by <@${existingClaimerId}>. Only one person can be responsible for the service.`),
        ])
      );
      return;
    }

    await channel.permissionOverwrites.edit(interaction.user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      ManageMessages: true,
    });

    // Update topic to "openerId:claimerId" so we can use it for rating/log later
    const openerId = topicRaw;
    if (openerId) {
      await channel.setTopic(`${openerId}:${interaction.user.id}`).catch(() => null);
    }

    await interaction.reply(
      v2Reply([
        infoContainer({
          title: "Ticket Claimed",
          description: `${interaction.user} is now responsible for this ticket.\n\nPlease wait while our team reviews your request.`,
          avatarUrl: interaction.user.displayAvatarURL({ size: 256 }),
        }),
      ])
    );

    logger.info({ moderator: interaction.user.tag, channel: channel.name }, "Ticket claimed");
  } else if (action === "rate") {
    // parts: ["ticket", "rate", stars, claimerId, targetUserId]
    const [, , starsStr, claimerId, targetUserId] = parts;
    const stars = parseInt(starsStr ?? "0", 10);

    if (!claimerId || !targetUserId || isNaN(stars)) {
      await interaction.reply(v2EphemeralReply([errorContainer("Invalid rating data.")]));
      return;
    }

    // Only the targeted user can click this button
    if (interaction.user.id !== targetUserId) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("You cannot rate on another user's card.")])
      );
      return;
    }

    const channel = interaction.channel as TextChannel;
    const meta = ticketStore.get(channel.id);

    if (!meta) {
      await interaction.reply(v2EphemeralReply([errorContainer("Ticket metadata not found.")]));
      return;
    }

    if (targetUserId !== meta.openerId) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("You are not part of this ticket as the requester.")])
      );
      return;
    }

    meta.rating = stars;

    const ratingChannel = guild.channels.cache.get(RATING_CHANNEL_ID) as TextChannel | undefined;

    if (ratingChannel) {
      await ratingChannel.send({
        ...v2Reply([
          infoContainer({
            title: "New Service Rating",
            description: [
              `**Agent:** <@${claimerId}>`,
              `**Rated by:** <@${meta.openerId}>`,
              `**Rating:** ${starLabel(meta.rating!)} (${meta.rating}/3)`,
            ].join("\n"),
            avatarUrl: meta.thumbnailUrl ?? interaction.user.displayAvatarURL({ size: 256 }),
          }),
        ]),
      });
    }

    // Acknowledge and disable further ratings
    await interaction.update({
      ...v2Reply([
        infoContainer({
          title: "Rating Submitted!",
          description: `You gave **${stars} star${stars !== 1 ? "s" : ""}** to <@${claimerId}>. Thank you for your feedback!`,
        }),
      ]),
    } as never);

    logger.info({ userId: targetUserId, claimerId, stars, channel: channel.name }, "Ticket rated");
  }
}

// ─── Giveaway join button ─────────────────────────────────────────────────────

async function handleGiveawayJoin(interaction: ButtonInteraction, parts: string[]) {
  // customId: sorteio:entrar:channelId
  const channelId = parts[2];
  if (!channelId) {
    await interaction.reply(v2EphemeralReply([errorContainer("Giveaway not found.")]));
    return;
  }

  const messageId = giveawayByChannel.get(channelId);
  if (!messageId) {
    await interaction.reply(v2EphemeralReply([errorContainer("No active giveaway in this channel.")]));
    return;
  }

  const entry = giveawayStore.get(messageId);
  if (!entry || entry.ended) {
    await interaction.reply(v2EphemeralReply([errorContainer("This giveaway has already ended.")]));
    return;
  }

  if (entry.participants.has(interaction.user.id)) {
    await interaction.reply(v2EphemeralReply([errorContainer("You have already entered this giveaway!")]));
    return;
  }

  entry.participants.add(interaction.user.id);

  // Update the giveaway message with the new participant count
  const { container, actionRow } = buildGiveawayComponents(entry);
  const channel = interaction.channel as TextChannel;
  await channel.client.rest
    .patch(Routes.channelMessage(channelId, messageId), {
      body: {
        components: [container.toJSON(), actionRow.toJSON()],
        flags: MessageFlags.IsComponentsV2,
      },
    })
    .catch((err) => logger.error({ err }, "Failed to update giveaway message on join"));

  await interaction.reply(
    v2EphemeralReply([successContainer("You're in!", `You have entered the giveaway for **${entry.prize}**. Good luck! 🍀`)])
  );

  logger.info({ userId: interaction.user.id, prize: entry.prize, participants: entry.participants.size }, "User joined giveaway");
}
