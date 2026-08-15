import { GuildMember, Guild } from "discord.js";

// No role is immune by default — only members whose highest role is
// above the bot's highest role are protected from punishment.
// Async because the GuildMembers intent is disabled, so we fetch the bot
// member via REST when it is missing from the cache.
export async function isUserAboveBot(member: GuildMember, guild: Guild): Promise<boolean> {
  const botMember =
    guild.members.me ?? (await guild.members.fetch(guild.client.user.id).catch(() => null));
  if (!botMember) return false;
  return member.roles.highest.comparePositionTo(botMember.roles.highest) > 0;
}
