export type UserRole = 'admin' | 'coadmin' | 'moderator' | 'member' | 'recruit';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type DiscordPresence = 'online' | 'idle' | 'dnd' | 'offline';
export const CHAT_ROLES: UserRole[] = ['admin', 'coadmin', 'moderator', 'member'];

export interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  channel: 'group' | 'dm';
  recipientId?: string;
  content: string;
  attachment?: {
    type: 'image' | 'document';
    name: string;
    dataUrl: string;
  };
  createdAt: string;
  seenBy?: string[];
  starred?: boolean;
  pinned?: boolean;
}

export interface ChatTypingUser {
  authorId: string;
  authorName: string;
  channel: 'group' | 'dm';
  recipientId?: string;
  isTyping: boolean;
}

export interface MemberStats {
  matches: number;
  winRate: number;
  eliminations: number;
  booyahs: number;
  accountLevel: number;
  headshotRate: number;
  likes?: number;
  brMaxRank?: number;
  brRankPoints?: number;
  csMaxRank?: number;
  csRankPoints?: number;
}

export const DEFAULT_MEMBER_STATS: MemberStats = {
  matches: 247,
  winRate: 68,
  eliminations: 1832,
  booyahs: 168,
  accountLevel: 70,
  headshotRate: 42,
};

export const EMPTY_MEMBER_STATS: MemberStats = {
  matches: 0,
  winRate: 0,
  eliminations: 0,
  booyahs: 0,
  accountLevel: 0,
  headshotRate: 0,
};

export type ProfileVisibility = 'public' | 'guild' | 'private';

export interface GuildMember {
  id: string;
  discordId: string;
  displayName: string;
  discordName: string;
  avatar: string;
  discordDisplayName?: string;
  discordAvatar?: string;
  discordBio?: string;
  discordStatus?: string;
  freeFireName?: string;
  freeFireUid?: string;
  preferredRegion?: string;
  preferredPlaystyle?: string;
  profileVisibility?: ProfileVisibility;
  hasHlGamingApiKey?: boolean;
  role: UserRole;
  status: ApprovalStatus;
  joinDate: string;
  rank: string;
  rankingPoints?: number;
  rankingPosition?: number | null;
  rankingTitle?: string;
  bio: string;
  achievements: string[];
  stats?: MemberStats;
  character: CharacterConfig;
  isOnline: boolean;
  presence?: DiscordPresence;
  isOwner?: boolean;
  isInDiscordGuild?: boolean;
  suspendedFromRole?: UserRole;
  suspendedAt?: string;
  discordLeftAt?: string;
  discordSyncPending?: boolean;
  discordSyncPendingAt?: string;
  application?: JoinApplication;
}

export interface JoinApplication {
  fullName: string;
  gameId: string;
  region?: string;
  experience: string;
  imageName: string;
  acceptedTerms: boolean;
  verificationMode?: 'recommended' | 'strong';
  verificationCode?: string;
  verificationProofName?: string;
}

export interface CharacterConfig {
  appearance: {
    base: string;
    hairstyle: string;
    face: string;
    skinTone: string;
  };
  outfit: {
    headwear: string;
    top: string;
    bottom: string;
    footwear: string;
  };
  accessories: {
    mask: string;
    glasses: string;
    back: string;
  };
  effects: {
    aura: string;
    cardEffect: string;
    entranceAnimation: string;
  };
}

export interface CustomizationItem {
  id: string;
  category: 'appearance' | 'outfit' | 'accessories' | 'effects';
  subcategory: string;
  name: string;
  rarity: 'standard' | 'special' | 'admin' | 'event';
  enabled: boolean;
  assignedTo?: string[];
}

export interface GuildEvent {
  id: string;
  name: string;
  type: 'custom-match' | 'tournament' | 'practice' | 'scrim' | 'recruitment';
  date: string;
  time: string;
  description: string;
  participantLimit: number;
  participants: string[];
  status: 'upcoming' | 'live' | 'completed' | 'cancelled';
  organizerId?: string;
  createdAt?: string;
  updatedAt?: string;
  registrationOpen?: boolean;
  tournament?: {
    format?: 'single_elimination';
    championId?: string;
    winnerId?: string;
    verified?: boolean;
    standings?: Array<{ memberId: string; wins: number; losses: number; placement: number }>;
  };
  result?: {
    winnerId?: string;
    summary?: string;
    verifiedBy?: string;
    verifiedAt?: string;
  };
}

export type TournamentFormat = 'single_elimination';
export type TournamentStatus = 'draft' | 'registration_open' | 'registration_closed' | 'active' | 'completed' | 'cancelled';

export interface Tournament {
  id: string;
  eventId: string;
  name: string;
  description: string;
  format: TournamentFormat;
  gameMode: string;
  teamSize: number;
  maxTeams: number;
  registrationOpenAt: string;
  registrationCloseAt: string;
  startAt: string;
  endAt: string;
  status: TournamentStatus;
  scoringRules: {
    placementPoints?: Record<string, number>;
    killPoints?: number;
  };
  rankingIntegration: {
    enabled?: boolean;
    verifiedOnly?: boolean;
    taskId?: string;
  };
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type TournamentParticipantStatus = 'registered' | 'withdrawn' | 'disqualified';

export interface TournamentParticipant {
  id: string;
  tournamentId: string;
  memberId: string;
  status: TournamentParticipantStatus;
  registeredAt: string;
  updatedAt: string;
}

export type TournamentTeamStatus = 'active' | 'disbanded' | 'cancelled';

export interface TournamentTeam {
  id: string;
  tournamentId: string;
  name: string;
  captainMemberId: string;
  memberIds: string[];
  status: TournamentTeamStatus;
  createdAt: string;
  updatedAt: string;
}

export type TournamentMatchStatus = 'pending' | 'scheduled' | 'live' | 'completed' | 'cancelled' | 'disputed';

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  round: number;
  matchNumber: number;
  participantA: string | null;
  participantB: string | null;
  scheduledAt: string | null;
  status: TournamentMatchStatus;
  resultId: string | null;
  winnerId: string | null;
  nextMatchId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TournamentBracket {
  tournamentId: string;
  format: 'single_elimination';
  bracketSize: number;
  rounds: number;
  matches: TournamentMatch[];
}

export type TournamentResultStatus = 'pending' | 'verified';

export interface TournamentResult {
  id: string;
  matchId: string;
  scoreA: number;
  scoreB: number;
  winnerId: string;
  submittedBy: string;
  status: TournamentResultStatus;
  submittedAt: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  correctionVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface TournamentStanding {
  id: string;
  tournamentId: string;
  teamId: string;
  wins: number;
  losses: number;
  matchesPlayed: number;
  placement: number | null;
  status: 'active' | 'eliminated' | 'withdrawn' | 'disqualified';
  lastResultId?: string | null;
  updatedAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  author: string;
  date: string;
  featured: boolean;
  category: 'match' | 'rules' | 'event' | 'recruitment' | 'update';
}

export interface GuildSettings {
  id: 'guild';
  name: string;
  description: string;
  discordServerUrl?: string;
  strongVerification?: boolean;
  guildOwnerUid?: string;
}

export interface GuildProfile {
  guildId: string;
  guildName: string;
  guildLevel: number;
  capacity: number;
  memberCount: number;
  ownerId: string;
  ownerName: string;
  region: string;
  refreshedAt: string;
}

export interface RankingTask {
  id: string;
  title: string;
  description: string;
  points: number;
  status: 'open' | 'completed';
  trigger: 'manual' | 'website-chat' | 'discord-message';
  createdBy: string;
  createdAt: string;
}

export interface RankingScore {
  id: string;
  taskId: string;
  memberId: string;
  points: number;
  awardedBy: string;
  awardedAt: string;
  source?: 'tournament';
  sourceResultId?: string;
}

export interface RankingEntry {
  memberId: string;
  points: number;
}

export interface RankChannelConfig {
  id: 'settings';
  includeAllChannels: boolean;
  includedChannelIds: string[];
  excludedChannelIds: string[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface ChatRankSummary {
  memberId: string;
  totalPoints: number;
  totalMessages: number;
  totalWords: number;
  lastMessageAt?: string;
  rankTitle: string;
  position?: number | null;
  channels?: string[];
}

export interface MapLocation {
  id: string;
  name: string;
  section: string;
  x: number;
  y: number;
  description: string;
  icon: string;
  adminOnly?: boolean;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Guild Leader',
  coadmin: 'Acting Leader',
  moderator: 'Elder',
  member: 'Guild Member',
  recruit: 'Non Guild Members',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'text-neon-400',
  coadmin: 'text-neon-300',
  moderator: 'text-tactical-200',
  member: 'text-gray-300',
  recruit: 'text-warning-400',
};

export const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
};
