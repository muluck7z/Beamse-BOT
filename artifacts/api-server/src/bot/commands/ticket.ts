import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { type BotCommand } from "../index";
import {
  successContainer,
  errorContainer,
  v2Reply,
  v2EphemeralReply,
  IS_COMPONENTS_V2,
} from "../v2/index";
import { ticketPanelConfig } from "../ticketStore";

const TICKET_EMOJI = "<:ticket:1508274275730063360>";

const TICKET_TYPES = [
  { label: "General Support", value: "support", description: "General issues or support requests", emoji: "\U0001F6E0" },
  { label: "Questions", value: "questions", description: "Ask your questions to our team", emoji: "\u2753" },
  { label: "Report", value: "report", description: "Report a user or situation", emoji: "\U0001F6A8" },
  { label: "Billing", value: "billing", description: "Payment-related issues", emoji: "\U0001F4B0" },
];

export const ticketCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Ticket system")
    .addSubcommand((sub) =>
      sub
        .setName("panel")
        .setDescription("Sends the ticket opening panel in the current channel")
        .addStringOption((opt) =>
          opt.setName("title").setDescription("Panel title").setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("thumbnail")
            .setDescription("URL of the image that will appear in the corner of the ticket, rating, and log embeds")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Adds a user to the ticket")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to add").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Removes a user from the ticket")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User to remove").setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    if (!guild) return;

    if (sub === "panel") {
      const titulo =
        interaction.options.getString("title") ?? `${TICKET_EMOJI} Support Center | Beamse`;
      const thumbnailRaw = interaction.options.getString("thumbnail");

      // Validate URL and save the panel configuration for this guild
      let thumbnailUrl: string | undefined;
      if (thumbnailRaw) {
        try {
          new URL(thumbnailRaw);
          thumbnailUrl = thumbnailRaw;
        } catch {
          await interaction.reply(
            v2EphemeralReply([errorContainer("The thumbnail URL is invalid. Use a full URL (e.g. https://...)")])
          );
          return;
        }
      }

      ticketPanelConfig.set(guild.id, { thumbnailUrl });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("ticket:type")
        .setPlaceholder("Select the type of service...")
        .addOptions(
          TICKET_TYPES.map((t) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(t.label)
              .setValue(t.value)
              .setDescription(t.description)
          )
        );

      const menuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      const descricao = [
        "After requesting support, please wait for a team member to respond.",
        "The service is handled privately — only team members will have access to the ticket.",
        "Please note that our team is not available 24 hours a day, but within the stated hours we will be available to assist you.",
        "",
        "Click the options below to continue:",
      ].join("\n");

      const container = new ContainerBuilder();

      // Title: with thumbnail or without
      if (thumbnailUrl) {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${titulo}`))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
        );
      } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${titulo}`));
      }

      container
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(descricao))
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addActionRowComponents(menuRow)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("-# Select an option to open your ticket")
        );

      await interaction.reply({
        components: [container],
        flags: IS_COMPONENTS_V2,
      } as never);
    } else if (sub === "add") {
      const channel = interaction.channel as TextChannel;
      if (!channel.name.startsWith("ticket-")) {
        await interaction.reply(v2EphemeralReply([errorContainer("This channel is not a ticket.")]));
        return;
      }
      const user = interaction.options.getUser("user", true);
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        await interaction.reply(v2EphemeralReply([errorContainer("User not found on the server.")]));
        return;
      }

      await channel.permissionOverwrites.edit(member, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      await interaction.reply(
        v2Reply([successContainer("User Added", `${user} has been added to the ticket.`)])
      );
    } else if (sub === "remove") {
      const channel = interaction.channel as TextChannel;
      if (!channel.name.startsWith("ticket-")) {
        await interaction.reply(v2EphemeralReply([errorContainer("This channel is not a ticket.")]));
        return;
      }
      const user = interaction.options.getUser("user", true);
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        await interaction.reply(v2EphemeralReply([errorContainer("User not found on the server.")]));
        return;
      }

      await channel.permissionOverwrites.edit(member, { ViewChannel: false });

      await interaction.reply(
        v2Reply([successContainer("User Removed", `${user} has been removed from the ticket.`)])
      );
    }
  },
};
