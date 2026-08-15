import {
  type StringSelectMenuInteraction,
  ChannelType,
  PermissionFlagsBits,
  type TextChannel,
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
import { ticketStore, ticketPanelConfig } from "../ticketStore";

const TICKET_EMOJI = "<:ticket:1508274275730063360>";

// @everyone is mentioned in the ticket (no specific staff role)

const TICKET_TYPE_LABELS: Record<string, string> = {
  support: "General Support",
  questions: "Questions",
  report: "Report",
  billing: "Billing",
};

export async function handleSelectMenu(interaction: StringSelectMenuInteraction) {
  const [ns, action] = interaction.customId.split(":");
  try {
    if (ns === "ticket" && action === "type") {
      await handleTicketTypeSelect(interaction);
    } else {
      logger.warn({ customId: interaction.customId }, "Unknown select menu interaction");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, customId: interaction.customId }, "Select menu handler error");
    const fallback = v2EphemeralReply([
      errorContainer(`Could not open the ticket. Please try again.\n\n\`${msg}\``),
    ]);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(fallback).catch(() => null);
    } else {
      await interaction.reply(fallback).catch(() => null);
    }
  }
}

async function handleTicketTypeSelect(interaction: StringSelectMenuInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  const ticketType = interaction.values[0]!;
  const typeLabel = TICKET_TYPE_LABELS[ticketType] ?? ticketType;

  await interaction.deferReply({ ephemeral: true });

  const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18);
  const ticketName = `ticket-${safeName}`;

  // Fetch all channels from the API (not cache) to get accurate state after restarts
  const allChannels = await guild.channels.fetch();
  const existing = allChannels.find((c) => c?.name === ticketName);
  if (existing) {
    await interaction.editReply(
      v2EphemeralReply([
        errorContainer(
          `You already have an open ticket: ${existing}\n\nPlease close your current ticket before opening a new one.`
        ),
      ])
    );
    return;
  }

  let category = allChannels.find(
    (c) => c?.name.toLowerCase() === "tickets" && c.type === ChannelType.GuildCategory
  );

  if (!category) {
    category = await guild.channels.create({
      name: "Tickets",
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ],
    });
  }

  const botId = interaction.client.user.id;
  const channel = await guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: interaction.user.id,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: botId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageChannels,
        ],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ],
  });

  // Thumbnail configured on the panel (if any)
  const thumbnailUrl = ticketPanelConfig.get(guild.id)?.thumbnailUrl;

  // Store ticket metadata for logs
  ticketStore.set(channel.id, {
    openerId: interaction.user.id,
    openerTag: interaction.user.tag,
    typeLabel,
    openedAt: new Date(),
    thumbnailUrl,
  });

  const btnCancel = secondaryButton("ticket:cancel_user", "Cancel");
  const btnClose = dangerButton("ticket:confirm_close", "Close Ticket");
  const btnClaim = secondaryButton("ticket:claim", "Claim Ticket");

  // Mention sent separately — text content cannot be mixed with IS_COMPONENTS_V2
  await (channel as TextChannel).send({
    content: `${interaction.user} | @everyone`,
    allowedMentions: { users: [interaction.user.id], roles: [guild.roles.everyone.id] },
  });

  await (channel as TextChannel).send({
    ...v2Reply(
      [
        infoContainer({
          title: `${TICKET_EMOJI} Ticket Opened — ${typeLabel}`,
          description: [
            `Hello, ${interaction.user}! Your ticket has been opened successfully.`,
            "",
            "Please **describe your issue or request in detail** and wait — a member of our team will get in touch as soon as possible.",
            "",
            "**Note:** if no message is sent, the ticket may be closed automatically due to inactivity.",
          ].join("\n"),
          // Uses the panel thumbnail if configured, otherwise the user's avatar
          avatarUrl: thumbnailUrl ?? interaction.user.displayAvatarURL({ size: 256 }),
        }),
      ],
      { buttons: [row(btnCancel, btnClose, btnClaim)] }
    ),
  });

  await interaction.editReply(
    v2EphemeralReply([successContainer("Ticket Opened!", `Your ticket was created in ${channel}`)])
  );

  logger.info({ user: interaction.user.tag, ticketType, channel: ticketName }, "Ticket opened");
}
