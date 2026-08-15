export interface TicketMeta {
  openerId: string;
  openerTag: string;
  typeLabel: string;
  openedAt: Date;
  rating?: number;
  thumbnailUrl?: string;
}

// channelId → ticket metadata
export const ticketStore = new Map<string, TicketMeta>();

// guildId → panel configuration (global thumbnail for this guild)
export const ticketPanelConfig = new Map<string, { thumbnailUrl?: string }>();

// Role ID that is exclusively allowed to see, claim, and manage tickets
export const TICKET_STAFF_ROLE_ID = "1538004139726868501";
