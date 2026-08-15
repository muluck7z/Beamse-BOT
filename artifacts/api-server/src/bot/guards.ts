import { GuildMember, Guild } from "discord.js";

// No role is immune by default — only members whose highest role is
// above the bot's highest role are protected from punishment.
export function isUserAboveBot(member: GuildMember, guild: Guild): boolean {
  const botMember = guild.members.me;
  if (!botMember) return false;
  return member.roles.highest.comparePositionTo(botMember.roles.highest) > 0;
}
