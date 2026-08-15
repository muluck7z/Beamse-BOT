import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type TextChannel,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  Routes,
  ChannelType,
} from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, v2Reply, v2EphemeralReply, errorContainer, successContainer, COLORS } from "../v2/index";
import {
  giveawayStore,
  giveawayByChannel,
  lastEndedByChannel,
  type GiveawayEntry,
} from "../giveawayStore";
import { logger } from "../../lib/logger";

// ─── Build giveaway message ───────────────────────────────────────────────────

export function buildGiveawayComponents(
  entry: GiveawayEntry,
  winners?: string[]
): { container: ContainerBuilder; actionRow: ActionRowBuilder<ButtonBuilder> } {
  const ended = entry.ended;
  const count = entry.participants.size;
  const endTs = Math.floor(entry.endsAt / 1000);

  let bodyLines: string[];

  if (ended && winners !== undefined) {
    if (winners.length === 0) {
      bodyLines = [
        `🏆 **Prize:** ${entry.prize}`,
        `👥 **Winners:** ${entry.numWinners}`,
        `🎟️ **Participants:** ${count}`,
        "",
        "❌ No participants. Giveaway ended without a winner.",
      ];
    } else {
      bodyLines = [
        `🏆 **Prize:** ${entry.prize}`,
        `👥 **Winners:** ${entry.numWinners}`,
        `🎟️ **Participants:** ${count}`,
        "",
        `🥳 **${winners.length === 1 ? "Winner" : "Winners"}:**`,
        winners.map((id) => `<@${id}>`).join("\n"),
      ];
    }
  } else {
    bodyLines = [
      `🏆 **Prize:** ${entry.prize}`,
      `👥 **Winners:** ${entry.numWinners}`,
      `⏰ **Ends:** <t:${endTs}:R>`,
      `🎟️ **Participants:** ${count}`,
      "",
      "Click the button below to enter!",
    ];
  }

  const container = new ContainerBuilder()
    .setAccentColor(ended ? COLORS.danger : COLORS.warning)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 🎉 Giveaway${ended ? " — Ended" : ""}`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(bodyLines.join("\n"))
    );

  // customId uses channelId so the button lookup does not need the messageId
  const btn = new ButtonBuilder()
    .setCustomId(`sorteio:entrar:${entry.channelId}`)
    .setLabel("🎉 Enter!")
    .setStyle(ButtonStyle.Success)
    .setDisabled(ended);

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);

  return { container, actionRow };
}

// ─── End giveaway (auto timer and /sorteio end subcommand) ────────────────────

export async function endGiveaway(
  entry: GiveawayEntry,
  channel: TextChannel
): Promise<void> {
  if (entry.ended) return;
  entry.ended = true;
  clearTimeout(entry.timer);

  // Random winner selection
  const participantsArr = Array.from(entry.participants);
  const shuffled = participantsArr.sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, entry.numWinners);

  // Edit original message via REST to preserve the IsComponentsV2 flag
  const { container, actionRow } = buildGiveawayComponents(entry, winners);
  await channel.client.rest
    .patch(Routes.channelMessage(entry.channelId, entry.messageId), {
      body: {
        components: [container.toJSON(), actionRow.toJSON()],
        flags: MessageFlags.IsComponentsV2,
      },
    })
    .catch((err) => logger.error({ err }, "Failed to edit giveaway message"));

  // Announce winners in the channel
  if (winners.length > 0) {
    const mentions = winners.map((id) => `<@${id}>`).join(", ");
    await channel.client.rest.post(Routes.channelMessages(channel.id), {
      body: {
        content: mentions,
        allowed_mentions: { users: winners },
        components: [
          infoContainer({
            title: "🎊 We have winner(s)!",
            description: [
              `**Prize:** ${entry.prize}`,
              "",
              `**${winners.length === 1 ? "Winner" : "Winners"}:** ${mentions}`,
              "",
              "Congratulations! Contact the staff to claim your prize. 🎁",
            ].join("\n"),
          }).toJSON(),
        ],
        flags: MessageFlags.IsComponentsV2,
      },
    }).catch((err) => logger.error({ err }, "Failed to announce winners"));
  } else {
    await channel.client.rest.post(Routes.channelMessages(channel.id), {
      body: {
        components: [
          infoContainer({
            title: "😔 Giveaway Ended",
            description: `The giveaway for **${entry.prize}** ended with no participants.`,
          }).toJSON(),
        ],
        flags: MessageFlags.IsComponentsV2,
      },
    }).catch((err) => logger.error({ err }, "Failed to announce no winners"));
  }

  // Move to history; remove from active
  giveawayByChannel.delete(entry.channelId);
  lastEndedByChannel.set(entry.channelId, entry.messageId);

  logger.info({ prize: entry.prize, winners, channel: entry.channelId }, "Giveaway ended");
}

// ─── Command ──────────────────────────────────────────────────────────────────

export const giveawayCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("sorteio")
    .setDescription("Manages giveaways on the server")
    .addSubcommand((sub) =>
      sub
        .setName("criar")
        .setDescription("Creates a new giveaway in a channel")
        .addStringOption((opt) =>
          opt.setName("premio").setDescription("What will be raffled").setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("duracao")
            .setDescription("Giveaway duration")
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption((opt) =>
          opt
            .setName("unidade")
            .setDescription("Time unit")
            .setRequired(true)
            .addChoices(
              { name: "Minutes", value: "minutes" },
              { name: "Hours", value: "hours" },
              { name: "Days", value: "days" }
            )
        )
        .addIntegerOption((opt) =>
          opt
            .setName("ganhadores")
            .setDescription("Number of winners")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10)
        )
        .addChannelOption((opt) =>
          opt
            .setName("canal")
            .setDescription("Channel where the giveaway will be posted")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("encerrar")
        .setDescription("Ends the active giveaway in a channel early")
        .addChannelOption((opt) =>
          opt
            .setName("canal")
            .setDescription("Channel with the active giveaway")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("resorteiar")
        .setDescription("Re-rolls the last ended giveaway with the same participants")
        .addChannelOption((opt) =>
          opt
            .setName("canal")
            .setDescription("Channel of the original giveaway")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild!;

    // ── /sorteio criar ────────────────────────────────────────────────────────
    if (sub === "criar") {
      const premio = interaction.options.getString("premio", true);
      const duracao = interaction.options.getInteger("duracao", true);
      const unidade = interaction.options.getString("unidade", true);
      const numGanhadores = interaction.options.getInteger("ganhadores", true);
      const canal = interaction.options.getChannel("canal", true) as TextChannel;

      // Check if a giveaway is already active in that channel
      if (giveawayByChannel.has(canal.id)) {
        await interaction.reply(
          v2EphemeralReply([errorContainer(`There is already an active giveaway in <#${canal.id}>. End it first with \`/sorteio encerrar\`.`)])
        );
        return;
      }

      // Calculate duration in ms
      const mult = unidade === "minutes" ? 60_000 : unidade === "hours" ? 3_600_000 : 86_400_000;
      const durationMs = duracao * mult;
      const endsAt = Date.now() + durationMs;

      // Temporary entry to build the message (no timer/messageId yet)
      const entryProvisional: GiveawayEntry = {
        prize: premio,
        channelId: canal.id,
        messageId: "",
        guildId: guild.id,
        numWinners: numGanhadores,
        endsAt,
        participants: new Set(),
        creatorId: interaction.user.id,
        timer: null!,
        ended: false,
      };

      const { container, actionRow } = buildGiveawayComponents(entryProvisional);

      // Send via REST to guarantee the IsComponentsV2 flag
      let messageId: string;
      try {
        const raw = await canal.client.rest.post(
          Routes.channelMessages(canal.id),
          {
            body: {
              components: [container.toJSON(), actionRow.toJSON()],
              flags: MessageFlags.IsComponentsV2,
            },
          }
        ) as { id: string };
        messageId = raw.id;
      } catch (err) {
        logger.error({ err }, "Failed to send giveaway message");
        await interaction.reply(
          v2EphemeralReply([errorContainer(`Could not send the message in <#${canal.id}>. Check my permissions.`)])
        );
        return;
      }

      // Create the real entry with the correct messageId
      const entry: GiveawayEntry = {
        ...entryProvisional,
        messageId,
        timer: setTimeout(async () => {
          const ch = guild.channels.cache.get(canal.id) as TextChannel | undefined;
          if (!ch) return;
          await endGiveaway(entry, ch).catch((err) =>
            logger.error({ err }, "Error ending giveaway automatically")
          );
        }, durationMs),
      };

      giveawayStore.set(messageId, entry);
      giveawayByChannel.set(canal.id, messageId);

      const unitLabel = unidade === "minutes"
        ? `${duracao} minute${duracao > 1 ? "s" : ""}`
        : unidade === "hours"
          ? `${duracao} hour${duracao > 1 ? "s" : ""}`
          : `${duracao} day${duracao > 1 ? "s" : ""}`;

      await interaction.reply(
        v2EphemeralReply([
          successContainer(
            "Giveaway Created!",
            [
              `**Prize:** ${premio}`,
              `**Duration:** ${unitLabel}`,
              `**Winners:** ${numGanhadores}`,
              `**Channel:** <#${canal.id}>`,
            ].join("\n")
          ),
        ])
      );

      logger.info({ prize: premio, durationMs, winners: numGanhadores, channel: canal.id }, "Giveaway created");
    }

    // ── /sorteio encerrar ─────────────────────────────────────────────────────
    else if (sub === "encerrar") {
      const canal = interaction.options.getChannel("canal", true) as TextChannel;
      const messageId = giveawayByChannel.get(canal.id);

      if (!messageId) {
        await interaction.reply(
          v2EphemeralReply([errorContainer(`There is no active giveaway in <#${canal.id}>.`)])
        );
        return;
      }

      const entry = giveawayStore.get(messageId);
      if (!entry || entry.ended) {
        await interaction.reply(
          v2EphemeralReply([errorContainer(`There is no active giveaway in <#${canal.id}>.`)])
        );
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      await endGiveaway(entry, canal);

      await interaction.editReply({
        ...v2EphemeralReply([successContainer("Giveaway Ended", `The giveaway in <#${canal.id}> was ended manually.`)]),
      });
    }

    // ── /sorteio resorteiar ───────────────────────────────────────────────────
    else if (sub === "resorteiar") {
      const canal = interaction.options.getChannel("canal", true) as TextChannel;
      const lastId = lastEndedByChannel.get(canal.id);

      if (!lastId) {
        await interaction.reply(
          v2EphemeralReply([errorContainer(`No ended giveaway found for <#${canal.id}>.`)])
        );
        return;
      }

      const lastEntry = giveawayStore.get(lastId);
      if (!lastEntry) {
        await interaction.reply(
          v2EphemeralReply([errorContainer(`Data for the last giveaway in <#${canal.id}> not found.`)])
        );
        return;
      }

      if (lastEntry.participants.size === 0) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("The last giveaway had no participants. Cannot reroll.")])
        );
        return;
      }

      // Re-roll among the same participants
      const participantsArr = Array.from(lastEntry.participants);
      const shuffled = participantsArr.sort(() => Math.random() - 0.5);
      const winners = shuffled.slice(0, lastEntry.numWinners);
      const mentions = winners.map((id) => `<@${id}>`).join(", ");

      await interaction.deferReply({ ephemeral: true });

      await canal.client.rest.post(Routes.channelMessages(canal.id), {
        body: {
          content: mentions,
          allowed_mentions: { users: winners },
          components: [
            infoContainer({
              title: "🎊 Reroll!",
              description: [
                `**Prize:** ${lastEntry.prize}`,
                `**Original participants:** ${participantsArr.length}`,
                "",
                `**${winners.length === 1 ? "New winner" : "New winners"}:** ${mentions}`,
                "",
                "Congratulations! Contact the staff to claim your prize. 🎁",
              ].join("\n"),
            }).toJSON(),
          ],
          flags: MessageFlags.IsComponentsV2,
        },
      }).catch((err) => logger.error({ err }, "Failed to post reroll"));

      await interaction.editReply({
        ...v2EphemeralReply([successContainer("Reroll Done!", `New winners announced in <#${canal.id}>.`)]),
      });

      logger.info({ prize: lastEntry.prize, winners, channel: canal.id }, "Reroll performed");
    }
  },
};
