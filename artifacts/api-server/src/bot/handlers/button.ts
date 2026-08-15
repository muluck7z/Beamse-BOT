import {
  type ButtonInteraction,
  type Message,
  type TextChannel,
  ButtonBuilder,
  ButtonStyle,
  Collection,
  PermissionFlagsBits,
  MessageFlags,
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

const TICKET_EMOJI = "<:ticket:1508274275730063360>";

// Channel where ticket ratings and close logs are sent (Beamse server)
const RATING_CHANNEL_ID = "1537975632653197403";
const LOG_CHANNEL_ID = "1537975632653197403";

// Role IDs with access to tickets — change to your staff/support role IDs
const TICKET_STAFF_ROLES = ["1497801117940056125", "1457907642633818204"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchAllMessages(channel: TextChannel): Promise<Message[]> {
  const all: Message[] = [];
  let before: string | undefined;

  while (true) {
    const batch: Collection<string, Message> = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });
    if (batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }

  return all;
}

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

async function sendTicketLog(options: {
  guild: ButtonInteraction["guild"] & object;
  channel: TextChannel;
  openerId: string | undefined;
  claimerId: string | undefined;
  closedById: string;
  closedByTag: string;
  reason: "moderator" | "user";
}) {
  const { guild, channel, openerId, claimerId, closedById, closedByTag, reason } = options;

  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID) as TextChannel | undefined;
  if (!logChannel) {
    logger.warn({ channelId: LOG_CHANNEL_ID }, "Log channel not found");
    return;
  }

  const meta = openerId ? ticketStore.get(channel.id) : undefined;
  const typeLabel = meta?.typeLabel ?? "Unknown";
  const openedAt = channel.createdAt;

  // Log thumbnail = avatar of the claimer (staff member who handled the ticket)
  let claimerAvatarUrl: string | undefined;
  if (claimerId) {
    try {
      const claimerMember = await guild.members.fetch(claimerId);
      claimerAvatarUrl = claimerMember.user.displayAvatarURL({ size: 256 });
    } catch {
      // no avatar available
    }
  }
  const durationMs = Date.now() - openedAt.getTime();
  const openedTs = Math.floor(openedAt.getTime() / 1000);

  // Fetch and count messages
  let openerMsgs = 0;
  let claimerMsgs = 0;
  let totalMsgs = 0;

  try {
    const messages = await fetchAllMessages(channel);
    totalMsgs = messages.filter((m) => !m.author.bot).length;
    openerMsgs = openerId
      ? messages.filter((m) => m.author.id === openerId && !m.author.bot).length
      : 0;
    claimerMsgs = claimerId
      ? messages.filter((m) => m.author.id === claimerId && !m.author.bot).length
      : 0;
  } catch (err) {
    logger.error({ err }, "Failed to fetch messages for ticket log");
  }

  const rating = meta?.rating;
  const ratingLine = rating !== undefined ? `${starLabel(rating)} (${rating}/3)` : "Not rated";

  const lines: string[] = [
    `**Channel:** \`${channel.name}\``,
    `**Type:** ${typeLabel}`,
    `**Opened at:** <t:${openedTs}:F>`,
    `**Duration:** ${formatDuration(durationMs)}`,
    "",
    `**Requester:** ${openerId ? `<@${openerId}>` : "Unknown"}`,
    `**Handled by:** ${claimerId ? `<@${claimerId}>` : "Not claimed"}`,
    `**Closed by:** <@${closedById}>`,
    "",
    `**Requester messages:** ${openerMsgs}`,
    `**Staff messages:** ${claimerMsgs}`,
    `**Total messages:** ${totalMsgs}`,
    "",
    `**Rating:** ${ratingLine}`,
  ];

  const emoji = reason === "user" ? "\U0001F6AA" : "\U0001F512";
  const title =
    reason === "user" ? `${emoji} Ticket Cancelled by User` : `${emoji} Ticket Closed`;

  await logChannel.send({
    ...v2Reply([infoContainer({ title, description: lines.join("\n"), avatarUrl: claimerAvatarUrl })]),
  });

  ticketStore.delete(channel.id);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const [ns, action] = parts;

  try {
    if (ns === "ticket") {
      await handleTicketButton(interaction, action!, parts);
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

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Only moderators can close tickets.")])
      );
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

    const closedById = interaction.user.id;
    const closedByTag = interaction.user.tag;

    setTimeout(async () => {
      await sendTicketLog({
        guild,
        channel,
        openerId: openerId || undefined,
        claimerId: claimerId || undefined,
        closedById,
        closedByTag,
        reason: "moderator",
      }).catch((err) => logger.error({ err }, "Failed to send ticket log"));

      await channel.delete("Ticket closed by moderator").catch(() => null);
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
              "Are you sure you want to cancel this ticket?\nThe channel will be removed and no moderator will be notified.",
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

    const topic = channel.topic ?? "";
    const [openerId, claimerId] = topic.split(":");
    const closedById = interaction.user.id;
    const closedByTag = interaction.user.tag;

    setTimeout(async () => {
      await sendTicketLog({
        guild,
        channel,
        openerId: openerId || undefined,
        claimerId: claimerId || undefined,
        closedById,
        closedByTag,
        reason: "user",
      }).catch((err) => logger.error({ err }, "Failed to send ticket log"));

      await channel.delete("Ticket cancelled by user").catch(() => null);
    }, 5_000);
  } else if (action === "claim") {
    const channel = interaction.channel as TextChannel;
    if (!channel.name.startsWith("ticket-")) {
      await interaction.reply(v2EphemeralReply([errorContainer("This channel is not a ticket.")]));
      return;
    }

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);

    let canClaim = false;
    if (member) {
      if (member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        canClaim = true;
      } else {
        canClaim = TICKET_STAFF_ROLES.some((id) => member.roles.cache.has(id));
      }
    }

    if (!canClaim) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("You do not have permission to claim tickets.")])
      );
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
