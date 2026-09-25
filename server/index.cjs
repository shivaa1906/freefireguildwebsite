require('dotenv').config();
const express = require('express');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns');
const { MongoClient } = require('mongodb');
const crypto = require('node:crypto');
const { Client, GatewayIntentBits, Events, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const httpServer = http.createServer(app);
const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const isProduction = process.env.NODE_ENV === 'production';
const mongoUrl = process.env.MONGODB_URI;
const rankingMongoUrl = process.env.RANKING_MONGODB_URI || process.env.MONGODB_URI_2;
const chatMongoUrl = process.env.CHAT_MONGODB_URI || process.env.MONGODB_URI_3;
const databaseName = process.env.MONGODB_DB || 'free_fire_guild';
const rankingDatabaseName = process.env.RANKING_MONGODB_DB || 'free_fire_rankings';
const chatDatabaseName = process.env.CHAT_MONGODB_DB || 'free_fire_chat';
const chatStorageLimitBytes = 10 * 1024 * 1024;
const auditLogsCollection = 'audit_logs';
const envValue = (name) => {
  const value = process.env[name]?.trim();
  return value && value !== '...' && !value.startsWith('your_') ? value : undefined;
};
const hlGamingAccountApiUrl = process.env.HLGAMING_ACCOUNT_API_URL || 'https://proapis.hlgamingofficial.com/main/games/freefire/account/api';
const hlGamingStatsApiUrl = process.env.HLGAMING_STATS_API_URL || 'https://proapis.hlgamingofficial.com/main/games/freefire/stats/api';
const hlGamingUserUid = envValue('HLGAMING_USER_UID');
const hlGamingApiKey = envValue('HLGAMING_API_KEY');
const hlGamingGuildApiKey = hlGamingApiKey;
const hlGamingMemberApiKeys = [envValue('HLGAMING_MEMBER_API_KEY_1'), envValue('HLGAMING_MEMBER_API_KEY_2')].filter(Boolean);
const hlGamingRegion = process.env.HLGAMING_REGION || 'ind';
const maxMemberRefreshesPerKey = Number(process.env.HLGAMING_MAX_MEMBER_REFRESHES_PER_KEY || 10);
const defaultRoleKeySettings = {
  guildLeader: { refreshEveryDays: 7, refreshDay: 'monday', refreshTime: '04:00', shareMemberCount: 1 },
  coadmin: { refreshEveryDays: 7, refreshDay: 'monday', refreshTime: '04:00', shareMemberCount: 1 },
  moderator: { refreshEveryDays: 7, refreshDay: 'monday', refreshTime: '04:00', shareMemberCount: 1 },
  member: { refreshEveryDays: 7, refreshDay: 'monday', refreshTime: '04:00', shareMemberCount: 1 },
};
const defaultAutomationSettings = Object.fromEntries(Object.keys(defaultRoleKeySettings).map((role) => [role, { frequency: 'weekly', customDays: 1, notifications: { discord: true, website: false, device: true }, enabled: true }]));
const defaultRankChannelConfig = Object.freeze({
  id: 'settings',
  includeAllChannels: true,
  includedChannelIds: [],
  excludedChannelIds: [],
  updatedAt: new Date(0).toISOString(),
  updatedBy: null,
});
const keylessRefreshIntervalMs = 14 * 24 * 60 * 60 * 1000;
const mongoDnsServers = (process.env.MONGODB_DNS_SERVERS || '1.1.1.1,8.8.8.8')
  .split(',')
  .map((server) => server.trim())
  .filter(Boolean);
if (mongoDnsServers.length > 0) dns.setServers(mongoDnsServers);
const localDataPath = process.env.LOCAL_DATA_PATH || path.join(__dirname, 'data.json');
const appUrl = (process.env.APP_URL || 'http://localhost:5173').trim().replace(/\/$/, '');
const discordClientId = process.env.DISCORD_CLIENT_ID;
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET;
const configuredSessionSecret = process.env.SESSION_SECRET?.trim();
const sessionSecret = configuredSessionSecret || 'free-fire-guild-local-development-secret';
const discordRedirectUri = (process.env.DISCORD_REDIRECT_URI || `${appUrl}/auth/discord/callback`).trim();
const discordBotToken = process.env.DISCORD_BOT_TOKEN;
const discordGuildId = process.env.DISCORD_GUILD_ID;
const discordReportChannelId = process.env.DISCORD_REPORT_CHANNEL_ID;
const discordCoadminRoleId = process.env.DISCORD_COADMIN_ROLE_ID;
const discordRoleNames = {
  admin: 'Guild Leader',
  coadmin: 'Guild Acting Leader',
  moderator: 'Guild Elder',
  member: 'Guild Members',
  members: 'Non Guild Members',
};
const discordRoleIds = {};
const roleMemberLimits = { admin: 1, coadmin: 1, moderator: 3, member: 45 };
const discordRoleSyncInProgress = new Set();
const discordDepartureTimers = new Map();
const discordDepartureGraceMs = 60 * 60 * 1000;
const memberReconciliationLocks = new Map();
const discordRoleAssignmentLocks = new Map();
const discordRoleInviteNotifications = new Map();
const chatRoles = new Set(['admin', 'coadmin', 'moderator', 'member']);
const chatMessages = [];
let chatMessagesLoaded = false;
const webSocketSessions = new Map();
const groupMessageMaxAge = 24 * 60 * 60 * 1000;
const sessions = new Map();
const sessionMaxAgeSeconds = 10 * 365 * 24 * 60 * 60;
const discordAccessTokens = new Map();
const oauthStates = new Map();
const webSocketClients = new Set();
let lastWeeklyReportKey = null;
let lastWeeklyStatsRefreshKey = null;
const discordBot = discordBotToken ? new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] }) : null;
if (isProduction) {
  if (!configuredSessionSecret || configuredSessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters in production.');
  if (!appUrl.startsWith('https://')) throw new Error('APP_URL must use HTTPS in production.');
  if (!discordRedirectUri.startsWith('https://')) throw new Error('DISCORD_REDIRECT_URI must use HTTPS in production.');
  if (discordRedirectUri !== `${appUrl}/auth/discord/callback`) throw new Error('DISCORD_REDIRECT_URI must be the Netlify callback URL: `${APP_URL}/auth/discord/callback`.');
  if (!mongoUrl || !rankingMongoUrl || !chatMongoUrl) throw new Error('MONGODB_URI, MONGODB_URI_2, and MONGODB_URI_3 are required in production.');
}
const allowedOrigins = new Set([appUrl, 'http://localhost:5173']);
const webSocketServer = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 7 * 1024 * 1024 });

webSocketServer.on('connection', async (socket, request) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    securityLog('websocket_origin_rejected', request, { origin });
    socket.close(1008, 'Origin is not allowed');
    return;
  }
  const session = getSession(request);
  if (!session) {
    securityLog('websocket_rejected', request, { reason: 'authentication_required' });
    socket.close(1008, 'Authentication required');
    return;
  }
  webSocketClients.add(socket);
  webSocketSessions.set(socket, request);
  const bioSyncInterval = session ? setInterval(async () => {
    if (socket.readyState !== WebSocket.OPEN) return;
    const sessionToken = getSessionToken(request);
    const discordToken = sessionToken ? discordAccessTokens.get(sessionToken) : null;
    if (!discordToken) return;
    const discordBio = await getDiscordBio(discordToken, session.discordId);
    if (!discordBio || discordBio === session.discordBio) return;
    session.discordBio = discordBio;
    if (sessionToken) sessions.set(sessionToken, session);
    await getDatabase().then((db) => db?.collection(collectionNames.members).updateOne({ id: session.id }, { $set: { discordBio } })).catch(() => null);
    socket.send(JSON.stringify({ type: 'profile', discordId: session.discordId, discordBio }));
  }, 5000) : null;
  if (session) {
    const sessionToken = getSessionToken(request);
    const discordToken = sessionToken ? discordAccessTokens.get(sessionToken) : null;
    if (discordToken) {
      const discordBio = await getDiscordBio(discordToken, session.discordId);
      if (discordBio) {
        session.discordBio = discordBio;
        if (sessionToken) sessions.set(sessionToken, session);
        await getDatabase().then((db) => db?.collection(collectionNames.members).updateOne({ id: session.id }, { $set: { discordBio } })).catch(() => null);
        socket.send(JSON.stringify({ type: 'profile', discordId: session.discordId, discordBio }));
      }
    }
    await loadChatMessages();
    pruneExpiredGroupMessages();
    pruneExpiredMessages();
    const visibleMessages = chatMessages.filter((message) => (message.channel === 'group' && chatRoles.has(session.role)) || hasPermission(session, 'chat.moderate') || message.authorId === session.id || message.recipientId === session.id);
    socket.send(JSON.stringify({ type: 'chat:history', messages: visibleMessages }));
  }
  if (discordBot?.isReady() && discordGuildId) {
    const guild = discordBot.guilds.cache.get(discordGuildId);
    if (guild) {
      await guild.members.fetch().catch(() => null);
      const onlineMembers = guild.members.cache.filter((member) => member.presence?.status && member.presence.status !== 'offline').size;
      socket.send(JSON.stringify({ type: 'guild:stats', totalMembers: guild.memberCount, onlineMembers }));
      const savedMembers = await getDatabase()
        .then((db) => db?.collection(collectionNames.members).find({ discordId: { $exists: true } }).project({ discordId: 1 }).toArray())
        .catch(() => getLocalDocuments(collectionNames.members));
      const discordMembers = new Map(guild.members.cache.map((guildMember) => [guildMember.id, guildMember]));
      for (const savedMember of savedMembers || []) {
        if (typeof savedMember.discordId === 'string' && !discordMembers.has(savedMember.discordId)) {
          discordMembers.set(savedMember.discordId, null);
        }
      }
      discordMembers.forEach((guildMember, discordId) => {
        const status = guildMember?.presence?.status || 'offline';
        const discordStatus = getDiscordCustomStatus(guildMember?.presence);
        socket.send(JSON.stringify({ type: 'presence', discordId, status, isOnline: status !== 'offline', discordStatus }));
        if (guildMember) {
          socket.send(JSON.stringify({ type: 'role', discordId: guildMember.id, ...getDiscordRoleData(guildMember) }));
          socket.send(JSON.stringify({ type: 'profile', discordId: guildMember.id, ...getDiscordProfileData(guildMember) }));
        }
      });
    }
  }
  socket.on('message', (rawMessage) => {
    let message;
    try {
      message = JSON.parse(rawMessage.toString());
    } catch (_error) {
      return;
    }
    const currentSession = getSession(request);
    if (!currentSession) {
      socket.close(1008, 'Authentication required');
      return;
    }
    if (currentSession.status === 'suspended') {
      socket.close(1008, 'Account suspended');
      return;
    }
    if (message.type === 'chat:refresh') {
      void loadChatMessages().then(() => {
        pruneExpiredGroupMessages();
        pruneExpiredMessages();
        const visibleMessages = chatMessages.filter((item) => (item.channel === 'group' && chatRoles.has(currentSession.role)) || hasPermission(currentSession, 'chat.moderate') || item.authorId === currentSession.id || item.recipientId === currentSession.id);
        socket.send(JSON.stringify({ type: 'chat:history', messages: visibleMessages }));
      });
      return;
    }
    if (message.type === 'chat:send' && typeof message.content === 'string' && (!message.attachment || message.attachment.type === 'image' || message.attachment.type === 'document')) {
      if (!chatRoles.has(currentSession.role)) return;
      pruneExpiredMessages();
      const content = message.content.trim().slice(0, 500);
      if (!content && !message.attachment) return;
      const chatMessage = {
        id: `chat-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        authorId: currentSession.id,
        authorName: currentSession.displayName,
        authorRole: currentSession.role,
        channel: 'group',
        seenBy: [],
        content,
        attachment: message.attachment,
        createdAt: new Date().toISOString(),
      };
      chatMessages.push(chatMessage);
      if (chatMessages.length > 100) chatMessages.shift();
      void persistChatMessage(chatMessage);
      void awardAutomaticScore('website-chat', currentSession.id);
      broadcast({ type: 'chat:message', chatMessage });
    }
    if (message.type === 'chat:dm' && typeof message.content === 'string' && typeof message.recipientId === 'string' && message.recipientId !== currentSession.id && chatRoles.has(currentSession.role) && (!message.attachment || message.attachment.type === 'image' || message.attachment.type === 'document')) {
      pruneExpiredMessages();
      const content = message.content.trim().slice(0, 500);
      if (!content && !message.attachment) return;
      const chatMessage = {
        id: `chat-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        authorId: currentSession.id,
        authorName: currentSession.displayName,
        authorRole: currentSession.role,
        channel: 'dm',
        recipientId: message.recipientId,
        seenBy: [],
        content,
        attachment: message.attachment,
        createdAt: new Date().toISOString(),
      };
      chatMessages.push(chatMessage);
      if (chatMessages.length > 100) chatMessages.shift();
      void persistChatMessage(chatMessage);
      void awardAutomaticScore('website-chat', currentSession.id);
      sendChatMessageToParticipants(chatMessage);
    }
    if (message.type === 'chat:seen' && Array.isArray(message.messageIds)) {
      const seenIds = message.messageIds.filter((id) => typeof id === 'string').slice(0, 100);
      const seenMessages = chatMessages.filter((item) => seenIds.includes(item.id) && item.authorId !== currentSession.id && (item.channel === 'group' || item.recipientId === currentSession.id));
      for (const item of seenMessages) item.seenBy = [...new Set([...(item.seenBy || []), currentSession.id])];
      void Promise.all(seenMessages.map((item) => updatePersistedChatMessage(item)));
      if (seenMessages.length > 0) {
        broadcast({ type: 'chat:seen', messageIdList: seenMessages.map((item) => item.id), readerId: currentSession.id });
      }
    }
    if (message.type === 'chat:typing' && typeof message.isTyping === 'boolean' && chatRoles.has(currentSession.role)) {
      const typingUser = {
        authorId: currentSession.id,
        authorName: currentSession.displayName,
        channel: message.recipientId ? 'dm' : 'group',
        recipientId: message.recipientId,
        isTyping: message.isTyping,
      };
      sendChatTypingToParticipants(typingUser);
    }
    if (message.type === 'chat:delete' && typeof message.id === 'string' && hasPermission(currentSession, 'chat.moderate')) {
      const messageIndex = chatMessages.findIndex((item) => item.id === message.id);
      if (messageIndex === -1) return;
      chatMessages.splice(messageIndex, 1);
      void removePersistedChatMessage(message.id);
      broadcast({ type: 'chat:deleted', messageId: message.id });
    }
  });
  socket.on('close', () => {
    if (bioSyncInterval) clearInterval(bioSyncInterval);
    webSocketClients.delete(socket);
    webSocketSessions.delete(socket);
  });
});

async function awardAutomaticScore(trigger, memberId) {
  try {
    const db = await getRankingDatabase();
    if (!db) return;
    const tasks = await db.collection(collectionNames['ranking-tasks']).find({ trigger, status: 'open' }).toArray();
    for (const task of tasks) {
      const existing = await db.collection(collectionNames['ranking-scores']).findOne({ taskId: task.id, memberId });
      if (existing) continue;
      const score = {
        id: `rank-score-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        taskId: task.id,
        memberId,
        points: task.points,
        awardedBy: 'system',
        awardedAt: new Date().toISOString(),
      };
      await db.collection(collectionNames['ranking-scores']).insertOne(score);
      broadcast({ type: 'ranking:score', score });
    }
  } catch (error) {
    console.warn(`Automatic ranking score failed: ${error.message}`);
  }
}

async function awardTournamentRankingForVerifiedResult(tournament, result, winningTeam) {
  const integration = tournament.rankingIntegration || {};
  if (integration.enabled !== true) return { status: 'skipped', reason: 'Tournament ranking integration is disabled.' };
  if (typeof integration.taskId !== 'string' || !integration.taskId.trim()) throw Object.assign(new Error('Tournament ranking integration is enabled but no ranking task is configured.'), { rankingIntegrationFailure: true });
  const rankingDb = await getRankingDatabase();
  const task = rankingDb
    ? await rankingDb.collection(collectionNames['ranking-tasks']).findOne({ id: integration.taskId, status: 'open' })
    : getLocalDocuments(collectionNames['ranking-tasks']).find((item) => item.id === integration.taskId && item.status === 'open');
  if (!task || !Number.isInteger(task.points) || task.points <= 0) throw Object.assign(new Error('The configured tournament ranking task is missing, closed, or has invalid points.'), { rankingIntegrationFailure: true });
  const scoresCollection = rankingDb?.collection(collectionNames['ranking-scores']);
  if (scoresCollection) await scoresCollection.createIndex({ sourceResultId: 1, memberId: 1 }, { unique: true, sparse: true });
  let awarded = 0;
  for (const memberId of winningTeam.memberIds) {
    const existing = rankingDb
      ? await scoresCollection.findOne({ sourceResultId: result.id, memberId })
      : getLocalDocuments(collectionNames['ranking-scores']).find((score) => score.sourceResultId === result.id && score.memberId === memberId);
    if (existing) continue;
    const score = {
      id: `rank-score-tournament-${result.id}-${memberId}`,
      taskId: task.id,
      memberId,
      points: task.points,
      awardedBy: 'system:tournament',
      awardedAt: new Date().toISOString(),
      source: 'tournament',
      sourceResultId: result.id,
    };
    try {
      if (rankingDb) await scoresCollection.insertOne(score);
      else saveLocalDocument(collectionNames['ranking-scores'], score);
      awarded += 1;
      broadcast({ type: 'ranking:score', score });
    } catch (error) {
      if (error?.code === 11000) continue;
      throw Object.assign(new Error(`Tournament ranking score could not be stored: ${error.message}`), { rankingIntegrationFailure: true });
    }
  }
  return { status: 'applied', taskId: task.id, points: task.points, memberCount: winningTeam.memberIds.length, awarded };
}

async function awardTournamentAchievementsForVerifiedResult(tournament, result, match, winnerTeam, loserTeam, standings) {
  const winnerStanding = standings.find((standing) => standing.teamId === winnerTeam.id);
  const isFinal = !match.nextMatchId;
  const labelsForWinner = ['Tournament Participant', 'First Tournament Win'];
  if (Number(winnerStanding?.wins || 0) >= 2) labelsForWinner.push('Multiple Tournament Wins');
  if (isFinal) labelsForWinner.push('Tournament Champion', 'Podium Finish');
  const labelsForLoser = ['Tournament Participant'];
  if (isFinal) labelsForLoser.push('Podium Finish');
  const labelsByMember = new Map();
  winnerTeam.memberIds.forEach((memberId) => labelsByMember.set(memberId, labelsForWinner));
  loserTeam.memberIds.forEach((memberId) => labelsByMember.set(memberId, labelsForLoser));
  const awarded = [];
  const skippedSuspended = [];
  for (const [memberId, labels] of labelsByMember.entries()) {
    const member = await findMemberById(memberId);
    if (!member || member.status === 'suspended' || member.status !== 'approved' || member.isInDiscordGuild !== true || member.discordLeftAt) {
      if (member?.status === 'suspended') skippedSuspended.push(memberId);
      continue;
    }
    const achievements = Array.isArray(member.achievements) ? member.achievements.filter(Boolean) : [];
    const nextAchievements = [...new Set([...achievements, ...labels])];
    const added = nextAchievements.filter((label) => !achievements.includes(label));
    if (added.length === 0) continue;
    const db = await getDatabase();
    if (db) await db.collection(collectionNames.members).updateOne({ id: member.id }, { $set: { achievements: nextAchievements } });
    else updateLocalDocument(collectionNames.members, member.id, { achievements: nextAchievements });
    updateActiveMemberSessions(member.id, { achievements: nextAchievements });
    awarded.push({ memberId: member.id, achievements: added });
  }
  return { status: 'applied', resultId: result.id, awarded, skippedSuspended };
}

function normalizeRankChannelConfig(config = {}) {
  const included = Array.isArray(config.includedChannelIds) ? config.includedChannelIds : [];
  const excluded = Array.isArray(config.excludedChannelIds) ? config.excludedChannelIds : [];
  const normalizedIncluded = [...new Set(included.map((channelId) => String(channelId).trim()).filter((channelId) => channelId && /^\d{10,20}$/.test(channelId)))];
  const normalizedExcluded = [...new Set(excluded.map((channelId) => String(channelId).trim()).filter((channelId) => channelId && /^\d{10,20}$/.test(channelId)))];
  const finalIncluded = normalizedIncluded.filter((channelId) => !normalizedExcluded.includes(channelId));
  const finalExcluded = normalizedExcluded.filter((channelId) => !finalIncluded.includes(channelId));
  return {
    id: 'settings',
    includeAllChannels: Boolean(config.includeAllChannels ?? true),
    includedChannelIds: finalIncluded,
    excludedChannelIds: finalExcluded,
    updatedAt: new Date().toISOString(),
    updatedBy: typeof config.updatedBy === 'string' ? config.updatedBy : null,
  };
}

async function getRankChannelConfig() {
  const rankingDb = await getRankingDatabase();
  if (rankingDb) {
    const config = await rankingDb.collection(collectionNames['rank-channel-config']).findOne({ id: 'settings' });
    if (config) return normalizeRankChannelConfig({ ...defaultRankChannelConfig, ...config, includedChannelIds: Array.isArray(config.includedChannelIds) ? config.includedChannelIds : [], excludedChannelIds: Array.isArray(config.excludedChannelIds) ? config.excludedChannelIds : [] });
  }
  const localConfig = getLocalDocuments(collectionNames['rank-channel-config']).find((entry) => entry.id === 'settings');
  if (localConfig) return normalizeRankChannelConfig({ ...defaultRankChannelConfig, ...localConfig, includedChannelIds: Array.isArray(localConfig.includedChannelIds) ? localConfig.includedChannelIds : [], excludedChannelIds: Array.isArray(localConfig.excludedChannelIds) ? localConfig.excludedChannelIds : [] });
  return normalizeRankChannelConfig(defaultRankChannelConfig);
}

async function saveRankChannelConfig(config) {
  const nextConfig = normalizeRankChannelConfig(config);
  const rankingDb = await getRankingDatabase();
  if (rankingDb) {
    await rankingDb.collection(collectionNames['rank-channel-config']).replaceOne({ id: 'settings' }, nextConfig, { upsert: true });
    return nextConfig;
  }
  saveLocalDocument(collectionNames['rank-channel-config'], nextConfig);
  return nextConfig;
}

function isRankChannelEligible(channelId, config = null) {
  const settings = config || defaultRankChannelConfig;
  if (!channelId || typeof channelId !== 'string') return false;
  const included = new Set(Array.isArray(settings.includedChannelIds) ? settings.includedChannelIds : []);
  const excluded = new Set(Array.isArray(settings.excludedChannelIds) ? settings.excludedChannelIds : []);
  if (settings.includeAllChannels) {
    return !excluded.has(channelId);
  }
  return included.has(channelId) && !excluded.has(channelId);
}

function getChatRankAntiSpamState(memberId) {
  const state = chatRankAwardHistory.get(memberId) || { timestamps: [], hashes: [] };
  const now = Date.now();
  state.timestamps = (state.timestamps || []).filter((timestamp) => now - timestamp < 60 * 60 * 1000);
  state.hashes = (state.hashes || []).filter((entry) => now - entry.timestamp < chatRankDuplicateWindowMs);
  chatRankAwardHistory.set(memberId, state);
  return state;
}

function isChatRankAllowed(memberId, content) {
  if (!memberId || typeof content !== 'string') return { allowed: false, reason: 'invalid_message' };
  const trimmed = content.trim();
  if (!trimmed || trimmed.length < chatRankMinimumLength) return { allowed: false, reason: 'empty_or_too_short' };
  const state = getChatRankAntiSpamState(memberId);
  const now = Date.now();
  const recentMinute = state.timestamps.filter((timestamp) => now - timestamp < 60 * 1000);
  const recentHour = state.timestamps.filter((timestamp) => now - timestamp < 60 * 60 * 1000);
  if (recentMinute.length >= chatRankAwardPerMinuteLimit) return { allowed: false, reason: 'rate_limit_per_minute' };
  if (recentHour.length >= chatRankAwardPerHourLimit) return { allowed: false, reason: 'rate_limit_per_hour' };
  const lastAwardAt = state.timestamps[state.timestamps.length - 1] || 0;
  if (now - lastAwardAt < chatRankAwardCooldownMs) return { allowed: false, reason: 'cooldown' };
  const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');
  const duplicate = state.hashes.some((entry) => entry.hash === normalized && now - entry.timestamp < chatRankDuplicateWindowMs);
  if (duplicate) return { allowed: false, reason: 'duplicate_content' };
  state.timestamps.push(now);
  state.hashes.push({ hash: normalized, timestamp: now });
  if (state.timestamps.length > 200) state.timestamps = state.timestamps.slice(-200);
  if (state.hashes.length > 200) state.hashes = state.hashes.slice(-200);
  chatRankAwardHistory.set(memberId, state);
  return { allowed: true, reason: null };
}

function getChatRankTitle(totalPoints) {
  if (!Number.isFinite(Number(totalPoints))) return 'New Recruit';
  const total = Number(totalPoints);
  if (total >= 500) return 'Guild Voice';
  if (total >= 250) return 'Tactical Talker';
  if (total >= 120) return 'Field Comms';
  if (total >= 40) return 'Squad Chatter';
  return 'New Recruit';
}

async function getMemberChatRankSummary(memberId) {
  const rankingDb = await getRankingDatabase();
  const summary = rankingDb
    ? await rankingDb.collection(collectionNames['chat-ranks']).findOne({ memberId })
    : getLocalDocuments(collectionNames['chat-ranks']).find((entry) => entry.memberId === memberId) || null;
  if (!summary) {
    return {
      memberId,
      totalPoints: 0,
      totalMessages: 0,
      totalWords: 0,
      lastMessageAt: null,
      rankTitle: 'New Recruit',
      position: null,
      channels: [],
    };
  }
  const leaderboard = await getChatRankLeaderboard();
  const position = leaderboard.findIndex((entry) => entry.memberId === memberId);
  return {
    memberId,
    totalPoints: Number(summary.totalPoints || 0),
    totalMessages: Number(summary.totalMessages || 0),
    totalWords: Number(summary.totalWords || 0),
    lastMessageAt: summary.lastMessageAt || null,
    rankTitle: getChatRankTitle(Number(summary.totalPoints || 0)),
    position: position >= 0 ? position + 1 : null,
    channels: Array.isArray(summary.channels) ? summary.channels : [],
  };
}

async function getChatRankLeaderboard() {
  const rankingDb = await getRankingDatabase();
  const records = rankingDb
    ? await rankingDb.collection(collectionNames['chat-ranks']).find({ totalPoints: { $gt: 0 } }).toArray()
    : getLocalDocuments(collectionNames['chat-ranks']).filter((entry) => Number(entry.totalPoints || 0) > 0);
  return records
    .map((entry) => ({
      memberId: entry.memberId,
      displayName: entry.displayName || 'Guild Member',
      avatar: entry.avatar || '',
      totalPoints: Number(entry.totalPoints || 0),
      totalMessages: Number(entry.totalMessages || 0),
      totalWords: Number(entry.totalWords || 0),
      channels: Array.isArray(entry.channels) ? entry.channels : [],
      lastMessageAt: entry.lastMessageAt || null,
      rankTitle: getChatRankTitle(Number(entry.totalPoints || 0)),
    }))
    .sort((first, second) => second.totalPoints - first.totalPoints || second.totalMessages - first.totalMessages || first.displayName.localeCompare(second.displayName))
    .map((entry, index) => ({ ...entry, position: index + 1 }));
}

async function awardChatRankActivity(memberId, { channelId, content, authorName, avatar, discordId }) {
  const config = await getRankChannelConfig();
  if (!isRankChannelEligible(channelId, config)) return null;
  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) return null;
  const eligibility = isChatRankAllowed(memberId, trimmed);
  if (!eligibility.allowed) return { blocked: true, reason: eligibility.reason };
  const rankingDb = await getRankingDatabase();
  const memberRecord = rankingDb
    ? await rankingDb.collection(collectionNames['chat-ranks']).findOne({ memberId })
    : getLocalDocuments(collectionNames['chat-ranks']).find((entry) => entry.memberId === memberId) || null;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const points = Math.min(8, Math.max(1, Math.ceil(wordCount / 8)));
  const timestamp = new Date().toISOString();
  const nextRecord = {
    id: memberRecord?.id || `chat-rank-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    memberId,
    displayName: authorName || memberRecord?.displayName || 'Guild Member',
    avatar: avatar || memberRecord?.avatar || '',
    discordId: discordId || memberRecord?.discordId || '',
    totalPoints: Number(memberRecord?.totalPoints || 0) + points,
    totalMessages: Number(memberRecord?.totalMessages || 0) + 1,
    totalWords: Number(memberRecord?.totalWords || 0) + wordCount,
    lastMessageAt: timestamp,
    channels: Array.from(new Set([...(Array.isArray(memberRecord?.channels) ? memberRecord.channels : []), channelId])).slice(0, 12),
    updatedAt: timestamp,
  };
  if (rankingDb) {
    await rankingDb.collection(collectionNames['chat-ranks']).replaceOne({ memberId }, nextRecord, { upsert: true });
  } else {
    saveLocalDocument(collectionNames['chat-ranks'], nextRecord);
  }
  const summary = {
    memberId,
    totalPoints: nextRecord.totalPoints,
    totalMessages: nextRecord.totalMessages,
    totalWords: nextRecord.totalWords,
    lastMessageAt: timestamp,
    rankTitle: getChatRankTitle(nextRecord.totalPoints),
    channels: nextRecord.channels,
    pointsAwarded: points,
  };
  broadcast({ type: 'chat:rank', summary });
  return summary;
}

async function registerDiscordCommands(client) {
  if (!discordGuildId) return;
  const guild = await client.guilds.fetch(discordGuildId);
  await guild.commands.set([
    new SlashCommandBuilder()
      .setName('top')
      .setDescription('Show the top 10 guild members by ranking points')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('rankincludechannel')
      .setDescription('Allow a Discord channel to contribute to chat ranking')
      .addChannelOption((option) => option.setName('channel').setDescription('The channel to include in chat ranking').setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('ranknotinclude')
      .setDescription('Exclude a Discord channel from chat ranking')
      .addChannelOption((option) => option.setName('channel').setDescription('The channel to exclude from chat ranking').setRequired(true))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('rankchannelreset')
      .setDescription('Reset the chat ranking channel rules back to the default behavior')
      .toJSON(),
  ]);
}

function getRankTitle(points) {
  if (!Number.isFinite(Number(points))) return 'Rookie';
  const total = Number(points);
  if (total >= 300) return 'Legend';
  if (total >= 180) return 'Elite';
  if (total >= 90) return 'Veteran';
  if (total >= 30) return 'Ranger';
  return 'Rookie';
}

function deriveRankingAchievements(member, totalPoints) {
  const legacy = Array.isArray(member?.achievements) ? member.achievements.filter(Boolean) : [];
  const badges = new Set(legacy);
  const thresholds = [
    { threshold: 10, label: 'First Points' },
    { threshold: 30, label: 'Guild Contributor' },
    { threshold: 90, label: 'Veteran' },
    { threshold: 180, label: 'Elite' },
    { threshold: 300, label: 'Legend' },
  ];
  for (const threshold of thresholds) {
    if (Number(totalPoints) >= threshold.threshold) badges.add(threshold.label);
  }
  return [...badges];
}

async function getMemberRankingSummary(memberId) {
  const rankingDb = await getRankingDatabase();
  const memberDb = await getDatabase();
  const scoreRecords = rankingDb
    ? await rankingDb.collection(collectionNames['ranking-scores']).find({ memberId }).toArray()
    : getLocalDocuments(collectionNames['ranking-scores']).filter((score) => score.memberId === memberId);
  const totalPoints = scoreRecords.reduce((total, score) => total + Number(score.points || 0), 0);
  const memberDocument = memberDb
    ? await memberDb.collection(collectionNames.members).findOne({ id: memberId })
    : getLocalDocuments(collectionNames.members).find((member) => member.id === memberId) || null;
  const position = await getLeaderboardPosition(memberId);
  return {
    memberId,
    points: totalPoints,
    rankTitle: getRankTitle(totalPoints),
    position,
    achievements: deriveRankingAchievements(memberDocument, totalPoints),
  };
}

async function getLeaderboardPosition(memberId) {
  const leaderboard = await getLeaderboardEntries();
  const index = leaderboard.findIndex((entry) => entry.memberId === memberId);
  return index >= 0 ? index + 1 : null;
}

async function getLeaderboardEntries() {
  const rankingDb = await getRankingDatabase();
  const membersDb = await getDatabase();
  const scores = rankingDb
    ? await rankingDb.collection(collectionNames['ranking-scores']).find({}).toArray()
    : getLocalDocuments(collectionNames['ranking-scores']);
  const members = membersDb
    ? await membersDb.collection(collectionNames.members).find({ status: 'approved' }).toArray()
    : getLocalDocuments(collectionNames.members).filter((member) => member.status === 'approved');
  const pointsByMember = new Map();
  for (const score of scores) {
    pointsByMember.set(score.memberId, (pointsByMember.get(score.memberId) || 0) + Number(score.points || 0));
  }
  return members
    .map((member) => ({
      memberId: member.id,
      displayName: member.displayName,
      discordName: member.discordName,
      avatar: member.avatar,
      points: pointsByMember.get(member.id) || 0,
      rankTitle: getRankTitle(pointsByMember.get(member.id) || 0),
      achievements: deriveRankingAchievements(member, pointsByMember.get(member.id) || 0),
    }))
    .filter((entry) => entry.points > 0)
    .sort((first, second) => second.points - first.points || first.displayName.localeCompare(second.displayName))
    .map((entry, index) => ({ ...entry, position: index + 1 }));
}

async function getTopRankedMembers(since) {
  const rankingDb = await getRankingDatabase();
  const membersDb = await getDatabase();
  const scores = rankingDb
    ? await rankingDb.collection(collectionNames['ranking-scores']).find({}).toArray()
    : getLocalDocuments(collectionNames['ranking-scores']);
  const members = membersDb
    ? await membersDb.collection(collectionNames.members).find({ status: 'approved' }).toArray()
    : getLocalDocuments(collectionNames.members).filter((member) => member.status === 'approved');
  const minimumTime = since ? since.getTime() : 0;
  const pointsByMember = new Map();
  for (const score of scores) {
    if (Date.parse(score.awardedAt) < minimumTime) continue;
    pointsByMember.set(score.memberId, (pointsByMember.get(score.memberId) || 0) + Number(score.points || 0));
  }
  return members
    .map((member) => ({ member, points: pointsByMember.get(member.id) || 0 }))
    .filter((entry) => entry.points > 0)
    .sort((first, second) => second.points - first.points || first.member.displayName.localeCompare(second.member.displayName))
    .slice(0, 10);
}

function formatRankingReport(rankings, title) {
  if (rankings.length === 0) return `**${title}**\nNo ranking points were awarded in this period.`;
  const lines = rankings.map(({ member, points }, index) => `${index + 1}. ${member.discordId ? `<@${member.discordId}>` : member.displayName} - **${points} pts**`);
  return `**${title}**\n${lines.join('\n')}`;
}

async function maybeSendWeeklyReport() {
  try {
    if (!discordBot?.isReady() || !discordReportChannelId) return;
    const now = new Date();
    if (now.getUTCDay() !== 1 || now.getUTCHours() !== 9) return;
    const reportKey = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
    if (lastWeeklyReportKey === reportKey) return;
    const channel = await discordBot.channels.fetch(discordReportChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const rankings = await getTopRankedMembers(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
    await channel.send(`${formatRankingReport(rankings, 'WEEKLY RANKING REPORT')}\n_Activity window: the last 7 days._`);
    lastWeeklyReportKey = reportKey;
  } catch (error) {
    console.warn(`Weekly Discord report failed: ${error.message}`);
  }
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const socket of webSocketClients) {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload);
  }
}

function broadcastMemberUpdate(member) {
  for (const socket of webSocketClients) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    const session = getSession(webSocketSessions.get(socket));
    if (!session) continue;
    const visibleMember = hasPermission(session, 'member.manage')
      ? publicMember(member)
      : member.status === 'approved'
        ? publicRosterMember(member)
        : null;
    if (visibleMember) socket.send(JSON.stringify({ type: 'member:upsert', member: visibleMember }));
  }
}

function pruneExpiredGroupMessages() {
  const cutoff = Date.now() - groupMessageMaxAge;
  for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
    const message = chatMessages[index];
    if (message.channel === 'group' && Date.parse(message.createdAt) < cutoff) chatMessages.splice(index, 1);
  }
}

function pruneExpiredMessages() {
  const cutoff = Date.now() - groupMessageMaxAge;
  for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
    if (Date.parse(chatMessages[index].createdAt) < cutoff) chatMessages.splice(index, 1);
  }
}

function sendChatMessageToParticipants(chatMessage) {
  for (const socket of webSocketClients) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    const session = getSession(webSocketSessions.get(socket));
    if (!session) continue;
    const isLeader = hasPermission(session, 'chat.moderate');
    const isParticipant = session.id === chatMessage.authorId || session.id === chatMessage.recipientId;
    if (chatMessage.channel === 'group' || isLeader || isParticipant) {
      socket.send(JSON.stringify({ type: 'chat:message', chatMessage }));
    }
  }
}

function sendChatTypingToParticipants(typingUser) {
  for (const socket of webSocketClients) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    const session = getSession(webSocketSessions.get(socket));
    if (!session) continue;
    const isLeader = hasPermission(session, 'chat.moderate');
    const isParticipant = session.id === typingUser.authorId || session.id === typingUser.recipientId;
    if (typingUser.channel === 'group' || isLeader || isParticipant) {
      socket.send(JSON.stringify({ type: 'chat:typing', typingUser }));
    }
  }
}

function sendDeviceReminderToMember(memberId, content) {
  let delivered = false;
  for (const socket of webSocketClients) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    const session = getSession(webSocketSessions.get(socket));
    if (!session || session.id !== memberId) continue;
    socket.send(JSON.stringify({ type: 'device:notification', title: 'API key reminder', content }));
    delivered = true;
  }
  return delivered;
}

app.use((request, response, next) => {
  const origin = request.headers.origin;
  if (isProduction && ['POST', 'PATCH', 'DELETE'].includes(request.method) && (!origin || !allowedOrigins.has(origin))) {
    securityLog('origin_rejected', request, { origin });
    return response.status(403).json({ error: 'Origin is not allowed.' });
  }
  if (origin === appUrl || origin === 'http://localhost:5173') {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  }
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProduction) response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (request.method === 'OPTIONS') {
    response.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: '10mb' }));

if (discordBot) {
  discordBot.once(Events.ClientReady, async (client) => {
    discordConnectionState = 'ready';
    discordLastReadyAt = new Date().toISOString();
    console.log(`Discord bot online as ${client.user.tag}`);
    await ensureDiscordRoles().catch((error) => console.error('Discord role setup failed:', error.message));
    await registerDiscordCommands(client).catch((error) => console.error('Discord command registration failed:', error.message));
    if (discordGuildId && !client.guilds.cache.has(discordGuildId)) {
      console.warn(`Discord bot is not connected to guild ${discordGuildId}`);
    }
    await restoreDiscordDepartureTimers();
    setInterval(() => void processDiscordDepartures(), 60 * 1000);
    void maybeSendWeeklyReport();
    setInterval(() => void maybeSendWeeklyReport(), 60 * 1000);
  });
  discordBot.on(Events.PresenceUpdate, async (_oldPresence, presence) => {
    const status = presence.status || 'offline';
    const isOnline = status !== 'offline';
    const discordStatus = getDiscordCustomStatus(presence);
    broadcast({ type: 'presence', discordId: presence.userId, status, isOnline, discordStatus });
    const guild = presence.guild;
    if (guild) {
      const onlineMembers = guild.members.cache.filter((member) => member.presence?.status && member.presence.status !== 'offline').size;
      broadcast({ type: 'guild:stats', totalMembers: guild.memberCount, onlineMembers });
    }
    try {
      const db = await getDatabase();
      await db?.collection(collectionNames.members).updateOne(
        { discordId: presence.userId },
        { $set: { presence: status, isOnline, discordStatus } },
      );
    } catch (_error) {
      // Presence updates are realtime enhancements; the WebSocket update still reaches clients.
    }
  });
  discordBot.on(Events.MessageCreate, async (message) => {
    if (!message.guildId || message.guildId !== discordGuildId || message.author.bot) return;
    if (message.webhookId || message.system || message.type !== 0) return;
    try {
      const db = await getDatabase();
      const member = await db?.collection(collectionNames.members).findOne({ discordId: message.author.id }, { projection: { id: 1, status: 1, role: 1, isInDiscordGuild: 1, discordId: 1, suspendedFromRole: 1, discordLeftAt: 1 } });
      if (!member?.id) return;
      if (member.status !== 'approved' || member.isInDiscordGuild === false || member.status === 'suspended') return;
      if (member.status === 'pending' || member.status === 'rejected' || member.status === 'suspended') return;
      const config = await getRankChannelConfig();
      if (!isRankChannelEligible(message.channelId, config)) return;
      if (!message.content?.trim() && message.attachments.size === 0) return;
      const summary = await awardChatRankActivity(member.id, {
        channelId: message.channelId,
        content: message.content || '',
        authorName: message.member?.displayName || message.author.username,
        avatar: message.author.displayAvatarURL({ extension: 'png', size: 128 }),
        discordId: message.author.id,
      });
      if (summary && !summary.blocked) {
        await recordAuditEvent({
          eventType: 'chat_rank_awarded',
          action: 'chat_rank_awarded',
          source: 'discord',
          actor: { id: member.id, discordId: member.discordId, displayName: message.member?.displayName || message.author.username, role: member.role },
          target: { id: member.id, discordId: member.discordId, displayName: message.member?.displayName || message.author.username },
          success: true,
          reason: `Discord chat rank awarded in channel ${message.channelId}`,
          metadata: { channelId: message.channelId, pointsAwarded: summary.pointsAwarded },
        }).catch(() => undefined);
      }
      void awardAutomaticScore('discord-message', member.id);
    } catch (error) {
      console.warn(`Discord message ranking check failed: ${error.message}`);
    }
  });
  discordBot.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'top') {
      await interaction.deferReply();
      try {
        const rankings = await getTopRankedMembers();
        await interaction.editReply(formatRankingReport(rankings, 'ALL-TIME TOP 10 RANKED MEMBERS'));
      } catch (error) {
        console.warn(`Discord ranking command failed: ${error.message}`);
        await interaction.editReply('Ranking data is temporarily unavailable.');
      }
      return;
    }
    if (!['rankincludechannel', 'ranknotinclude', 'rankchannelreset'].includes(interaction.commandName)) return;
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Only guild staff can manage chat ranking channels.', ephemeral: true });
      return;
    }
    const channel = interaction.options.getChannel('channel');
    const guildId = interaction.guildId || discordGuildId;
    const config = await getRankChannelConfig();
    try {
      if (interaction.commandName === 'rankincludechannel') {
        if (!channel) {
          await interaction.reply({ content: 'Please choose a valid Discord channel.', ephemeral: true });
          return;
        }
        const updated = await saveRankChannelConfig({
          ...config,
          includeAllChannels: false,
          includedChannelIds: Array.from(new Set([...(config.includedChannelIds || []), channel.id])),
          excludedChannelIds: (config.excludedChannelIds || []).filter((id) => id !== channel.id),
          updatedBy: `discord:${interaction.user.id}`,
        });
        await interaction.reply({ content: `Chat ranking is now enabled for <#${channel.id}>.`, ephemeral: true });
        await recordAuditEvent({ eventType: 'chat_rank_channel_included', action: 'chat_rank_channel_included', source: 'discord', actor: { id: interaction.user.id, discordId: interaction.user.id, name: interaction.user.username, role: 'staff' }, target: { id: channel.id, name: channel.name }, success: true, reason: 'Discord admin configured rank channel include', metadata: { channelId: channel.id, config: updated } }).catch(() => undefined);
      }
      if (interaction.commandName === 'ranknotinclude') {
        if (!channel) {
          await interaction.reply({ content: 'Please choose a valid Discord channel.', ephemeral: true });
          return;
        }
        const updated = await saveRankChannelConfig({
          ...config,
          includedChannelIds: (config.includedChannelIds || []).filter((id) => id !== channel.id),
          excludedChannelIds: Array.from(new Set([...(config.excludedChannelIds || []), channel.id])),
          updatedBy: `discord:${interaction.user.id}`,
        });
        await interaction.reply({ content: `Chat ranking has been disabled for <#${channel.id}>.`, ephemeral: true });
        await recordAuditEvent({ eventType: 'chat_rank_channel_excluded', action: 'chat_rank_channel_excluded', source: 'discord', actor: { id: interaction.user.id, discordId: interaction.user.id, name: interaction.user.username, role: 'staff' }, target: { id: channel.id, name: channel.name }, success: true, reason: 'Discord admin configured rank channel exclusion', metadata: { channelId: channel.id, config: updated } }).catch(() => undefined);
      }
      if (interaction.commandName === 'rankchannelreset') {
        if (!channel) {
          await interaction.reply({ content: 'Please choose a channel to reset.', ephemeral: true });
          return;
        }
        const updated = await saveRankChannelConfig({
          ...config,
          includedChannelIds: (config.includedChannelIds || []).filter((id) => id !== channel.id),
          excludedChannelIds: (config.excludedChannelIds || []).filter((id) => id !== channel.id),
          updatedBy: `discord:${interaction.user.id}`,
        });
        await interaction.reply({ content: `Chat ranking settings for <#${channel.id}> have been reset without affecting other channels.`, ephemeral: true });
        await recordAuditEvent({ eventType: 'chat_rank_channel_reset', action: 'chat_rank_channel_reset', source: 'discord', actor: { id: interaction.user.id, discordId: interaction.user.id, name: interaction.user.username, role: 'staff' }, target: { id: channel.id, name: channel.name }, success: true, reason: 'Discord admin reset a single rank channel entry', metadata: { guildId, channelId: channel.id, config: updated } }).catch(() => undefined);
      }
    } catch (error) {
      console.warn(`Discord rank channel command failed: ${error.message}`);
      await interaction.reply({ content: 'Channel rank settings could not be updated.', ephemeral: true });
    }
  });
  discordBot.on(Events.GuildMemberUpdate, async (_oldMember, guildMember) => {
    if (guildMember.guild.id !== discordGuildId) return;
    if (discordRoleSyncInProgress.has(guildMember.id)) return;
    await reconcileMember(guildMember.id, { guildMember, source: 'discord' }).catch((error) => {
      lastSyncFailureAt = new Date().toISOString();
      void recordAuditEvent({ eventType: 'reconciliation_failed', action: 'reconciliation_failed', source: 'discord', actor: { name: 'discord', role: 'system' }, target: { discordId: guildMember.id }, success: false, reason: error.message });
      console.error(`[sync] Discord role update failed for ${guildMember.id}: ${error.message}`);
    });
  });
  discordBot.on(Events.GuildMemberAdd, async (guildMember) => {
    if (guildMember.guild.id !== discordGuildId) return;
    await reconcileMember(guildMember.id, { guildMember, source: 'discord' }).catch((error) => {
      lastSyncFailureAt = new Date().toISOString();
      void recordAuditEvent({ eventType: 'reconciliation_failed', action: 'reconciliation_failed', source: 'discord', actor: { name: 'discord', role: 'system' }, target: { discordId: guildMember.id }, success: false, reason: error.message });
      console.error(`[sync] Discord member join reconciliation failed for ${guildMember.id}: ${error.message}`);
    });
  });
  discordBot.on(Events.GuildMemberRemove, async (guildMember) => {
    if (guildMember.guild.id !== discordGuildId) return;
    await markDiscordMemberAbsent(guildMember.id);
  });
  discordBot.on(Events.Error, (error) => {
    discordConnectionState = 'error';
    discordLastErrorAt = new Date().toISOString();
    console.error('Discord bot error:', error.message);
  });
  discordBot.login(discordBotToken).catch((error) => {
    discordConnectionState = 'error';
    discordLastErrorAt = new Date().toISOString();
    console.error('Discord bot login failed:', error.message);
  });
} else {
  console.warn('Discord bot is disabled: DISCORD_BOT_TOKEN is missing');
}

let database;
let mongoClient;
let mongoRetryAt = 0;
let mongoConnectPromise;
let rankingDatabase;
let rankingMongoClient;
let rankingMongoRetryAt = 0;
let rankingConnectPromise;
let chatDatabase;
let chatMongoClient;
let chatMongoRetryAt = 0;
let chatConnectPromise;
let chatUsingPrimaryDatabase = false;
let chatStorageLocalOnly = false;
let chatStorageUsageCheckedAt = 0;
let discordConnectionState = discordBot ? 'connecting' : 'disabled';
let discordLastReadyAt = null;
let discordLastErrorAt = null;
let discordLastInteractionAt = null;
let databaseUnavailableSince = null;
let lastDatabaseSuccessAt = null;
let lastSyncAttemptAt = null;
let lastSyncSuccessAt = null;
let lastSyncFailureAt = null;

async function getDatabase() {
  if (!mongoUrl) {
    databaseUnavailableSince ||= Date.now();
    return null;
  }
  if (Date.now() < mongoRetryAt) return null;
  if (!database) {
    if (mongoConnectPromise) return mongoConnectPromise;
    mongoConnectPromise = connectPrimaryDatabase();
    try {
      return await mongoConnectPromise;
    } finally {
      mongoConnectPromise = null;
    }
  }
  if (database) {
    lastDatabaseSuccessAt = new Date().toISOString();
    databaseUnavailableSince = null;
  }
  return database;
}

async function connectPrimaryDatabase() {
    const client = new MongoClient(mongoUrl, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    mongoClient = client;
    try {
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('MongoDB connection timed out')), 5000)),
      ]);
    } catch (error) {
      await client.close().catch(() => null);
      mongoClient = null;
      mongoRetryAt = Date.now() + 30000;
      databaseUnavailableSince ||= Date.now();
      return null;
    }
    database = mongoClient.db(databaseName);
    await database.collection(auditLogsCollection).createIndexes([
      { key: { timestamp: -1 }, name: 'audit_timestamp_desc' },
      { key: { actorId: 1, timestamp: -1 }, name: 'audit_actor_timestamp' },
      { key: { targetId: 1, timestamp: -1 }, name: 'audit_target_timestamp' },
      { key: { eventType: 1, timestamp: -1 }, name: 'audit_event_timestamp' },
      { key: { source: 1, timestamp: -1 }, name: 'audit_source_timestamp' },
      { key: { discordSyncPending: 1, discordSyncPendingAt: 1 }, name: 'member_sync_pending' },
      { key: { isInDiscordGuild: 1, discordLeftAt: 1 }, name: 'member_departure_state' },
      { key: { status: 1, role: 1 }, name: 'member_lifecycle_role' },
    ]).catch((error) => console.error(`[audit] index creation failed: ${error.message}`));
    return database;
}

async function getRankingDatabase() {
  if (!rankingMongoUrl) return null;
  if (Date.now() < rankingMongoRetryAt) return null;
  if (!rankingDatabase) {
    if (rankingConnectPromise) return rankingConnectPromise;
    rankingConnectPromise = connectRankingDatabase();
    try {
      return await rankingConnectPromise;
    } finally {
      rankingConnectPromise = null;
    }
  }
  return rankingDatabase;
}

async function connectRankingDatabase() {
    const client = new MongoClient(rankingMongoUrl, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
    rankingMongoClient = client;
    try {
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Ranking MongoDB connection timed out')), 5000)),
      ]);
    } catch (error) {
      await client.close().catch(() => null);
      rankingMongoClient = null;
      rankingMongoRetryAt = Date.now() + 30000;
      return null;
    }
    rankingDatabase = rankingMongoClient.db(rankingDatabaseName);
    return rankingDatabase;
}

async function getChatDatabase() {
  if (chatUsingPrimaryDatabase) return database;
  if (!chatMongoUrl) return getDatabase();
  if (Date.now() < chatMongoRetryAt) return null;
  if (!chatDatabase) {
    if (chatConnectPromise) return chatConnectPromise;
    chatConnectPromise = connectChatDatabase();
    try {
      return await chatConnectPromise;
    } finally {
      chatConnectPromise = null;
    }
  }
  return chatDatabase;
}

async function connectChatDatabase() {
    const client = new MongoClient(chatMongoUrl, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
    chatMongoClient = client;
    try {
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Chat MongoDB connection timed out')), 5000)),
      ]);
    } catch (error) {
      await client.close().catch(() => null);
      chatMongoClient = null;
      chatMongoRetryAt = Date.now() + 30000;
      const primaryDatabase = await getDatabase();
      if (primaryDatabase) {
        chatUsingPrimaryDatabase = true;
        return primaryDatabase;
      }
      console.warn(`Chat MongoDB unavailable, using local mirror for 30s: ${error.message}`);
      return null;
    }
    chatDatabase = chatMongoClient.db(chatDatabaseName);
    return chatDatabase;
}

async function isChatDatabaseWithinLimit(db) {
  if (!db || chatStorageLocalOnly) return false;
  if (Date.now() - chatStorageUsageCheckedAt < 30000) return true;
  try {
    const stats = await db.command({ collStats: 'chat_messages' });
    chatStorageUsageCheckedAt = Date.now();
    if (Number(stats.storageSize || 0) + Number(stats.totalIndexSize || 0) >= chatStorageLimitBytes) {
      chatStorageLocalOnly = true;
      console.warn('Chat MongoDB storage reached 10 MB; using local chat storage only.');
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`Chat MongoDB storage check unavailable, keeping local mirror: ${error.message}`);
    return false;
  }
}

async function loadChatMessages() {
  if (chatMessagesLoaded) return;
  const localMessages = getLocalDocuments('chat_messages');
  try {
    const db = await getChatDatabase();
    const databaseMessages = db && await isChatDatabaseWithinLimit(db)
      ? await db.collection('chat_messages').find({}).sort({ createdAt: 1 }).limit(100).toArray()
      : [];
    const messagesById = new Map([...databaseMessages, ...localMessages].map((message) => [message.id, message]));
    chatMessages.push(...[...messagesById.values()].sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt)).slice(-100));
  } catch (error) {
    console.warn(`Chat MongoDB read unavailable, using local data: ${error.message}`);
    chatMessages.push(...localMessages.slice(-100));
  }
  pruneExpiredMessages();
  chatMessagesLoaded = true;
}

async function persistChatMessage(message) {
  saveLocalDocument('chat_messages', message);
  try {
    const db = await getChatDatabase();
    if (await isChatDatabaseWithinLimit(db)) await db.collection('chat_messages').replaceOne({ id: message.id }, message, { upsert: true });
  } catch (error) {
    console.warn(`Chat MongoDB write unavailable, keeping local mirror: ${error.message}`);
  }
}

async function updatePersistedChatMessage(message) {
  saveLocalDocument('chat_messages', message);
  try {
    const db = await getChatDatabase();
    if (await isChatDatabaseWithinLimit(db)) await db.collection('chat_messages').updateOne({ id: message.id }, { $set: { seenBy: message.seenBy || [] } });
  } catch (error) {
    console.warn(`Chat MongoDB seen update unavailable, keeping local mirror: ${error.message}`);
  }
}

async function removePersistedChatMessage(id) {
  removeLocalDocument('chat_messages', id);
  try {
    const db = await getChatDatabase();
    if (await isChatDatabaseWithinLimit(db)) await db.collection('chat_messages').deleteOne({ id });
  } catch (error) {
    console.warn(`Chat MongoDB delete unavailable, keeping local mirror: ${error.message}`);
  }
}

const collectionNames = {
  members: 'members',
  events: 'events',
  tournaments: 'tournaments',
  'tournament-participants': 'tournament_participants',
  announcements: 'announcements',
  settings: 'settings',
  'ranking-tasks': 'ranking_tasks',
  'ranking-scores': 'ranking_scores',
  'rank-channel-config': 'rank_channel_config',
  'chat-ranks': 'chat_ranks',
};
const discordRoleInviteCollection = 'discord_role_invite_notifications';
const freeFireStatsCollection = 'free_fire_stats';
const hlGamingKeysCollection = 'hl_gaming_api_keys';
const hlGamingConfigCollection = 'hl_gaming_config';
const guildProfileCollection = 'guild_profile';
const guildProfileRefreshMs = 7 * 24 * 60 * 60 * 1000;

function getFreeFireStatsConfig(apiKey = hlGamingApiKey) {
  return Boolean(hlGamingUserUid && apiKey);
}

function encryptApiKey(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(sessionSecret).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptApiKey(value) {
  if (!value) return '';
  try {
    const [iv, tag, encrypted] = value.split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(sessionSecret).digest(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  } catch (_error) {
    return '';
  }
}

function maskApiKey(value) {
  if (!value) return null;
  return value.length <= 6 ? '••••••' : `${value.slice(0, 3)}••••${value.slice(-4)}`;
}

function publicMember(member, hasHlGamingApiKey = Boolean(member?.hlGamingApiKeyEncrypted)) {
  if (!member) return member;
  const { hlGamingApiKeyEncrypted, ...safeMember } = member;
  return { ...safeMember, hasHlGamingApiKey };
}

function publicRosterMember(member) {
  const safeMember = publicMember(member);
  const {
    discordId,
    application,
    suspendedFromRole,
    suspendedAt,
    discordLeftAt,
    discordSyncPending,
    discordSyncPendingAt,
    discordBio,
    discordStatus,
    isOwner,
    hasHlGamingApiKey,
    isInDiscordGuild,
    status,
    ...rosterMember
  } = safeMember;
  return { ...rosterMember, status: 'approved' };
}

function canViewMemberProfile(member, viewer) {
  if (!member) return false;
  if (!viewer) return false;
  if (member.id === viewer.id) return true;
  if (hasPermission(viewer, 'member.manage')) return true;
  if (member.status !== 'approved') return false;
  if (member.isInDiscordGuild === false) return false;
  if (member.profileVisibility === 'private') return false;
  if (member.profileVisibility === 'guild') return Boolean(viewer.status === 'approved' && viewer.isInDiscordGuild !== false);
  return true;
}

function buildMemberProfileView(member, viewer = null) {
  if (!member) return null;
  const allowFull = canViewMemberProfile(member, viewer);
  const profile = publicMember(member);
  if (allowFull && (viewer?.id === member.id || hasPermission(viewer, 'member.manage'))) return profile;
  if (!allowFull) return null;
  const {
    discordId,
    application,
    suspendedFromRole,
    suspendedAt,
    discordLeftAt,
    discordSyncPending,
    discordSyncPendingAt,
    discordBio,
    discordStatus,
    hasHlGamingApiKey,
    isOwner,
    isInDiscordGuild,
    status,
    ...safeProfile
  } = profile;
  return {
    ...safeProfile,
    status: 'approved',
    bio: member.bio || '',
    character: member.character || defaultCharacter,
    stats: member.stats || null,
    achievements: member.achievements || [],
    rank: member.rank || 'Member',
    presence: member.presence || 'offline',
    isOnline: Boolean(member.isOnline),
  };
}

const profileMutationRateLimit = new Map();
const chatRankAwardCooldownMs = 15 * 1000;
const chatRankAwardPerMinuteLimit = 5;
const chatRankAwardPerHourLimit = 40;
const chatRankDuplicateWindowMs = 60 * 1000;
const chatRankMinimumLength = 2;
const chatRankAwardHistory = new Map();

function checkProfileMutationRateLimit(memberId, request) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const key = memberId || request?.socket?.remoteAddress || 'anonymous';
  const previous = profileMutationRateLimit.get(key) || [];
  const recent = previous.filter((timestamp) => now - timestamp < windowMs);
  recent.push(now);
  profileMutationRateLimit.set(key, recent);
  return recent.length <= 8;
}

async function getStoredHlGamingKey(memberId) {
  const db = await getRankingDatabase();
  return db?.collection(hlGamingKeysCollection).findOne({ memberId }) || null;
}

async function getHlGamingConfig() {
  const db = await getRankingDatabase();
  const saved = await db?.collection(hlGamingConfigCollection).findOne({ id: 'settings' });
  return {
    maxMemberRefreshesPerKey: Number(saved?.maxMemberRefreshesPerKey) || maxMemberRefreshesPerKey,
    roleSettings: Object.fromEntries(Object.entries(defaultRoleKeySettings).map(([role, defaults]) => [role, { ...defaults, ...(saved?.roleSettings?.[role] || {}) }])),
    automationSettings: Object.fromEntries(Object.entries(defaultAutomationSettings).map(([role, defaults]) => [role, { ...defaults, ...(saved?.automationSettings?.[role] || {}), notifications: { ...defaults.notifications, ...(saved?.automationSettings?.[role]?.notifications || {}) } }])),
  };
}

function publicRoleKeys(config) {
  return Object.fromEntries(Object.keys(defaultRoleKeySettings).map((role) => {
    const key = decryptApiKey(config?.roleApiKeys?.[role]);
    return [role, { configured: Boolean(key), key: maskApiKey(key), source: 'Website-managed encrypted key' }];
  }));
}

async function publicMemberWithKey(member) {
  const keyRecord = await getStoredHlGamingKey(member?.id);
  return publicMember(member, Boolean(keyRecord?.apiKeyEncrypted));
}

async function validateHlGamingApiKey(apiKey, uid, region) {
  if (!hlGamingUserUid) throw new Error('HL Gaming user UID is not configured on the server.');
  const response = await fetch(hlGamingAccountApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sectionName: 'AllData', PlayerUid: uid, region: region.toUpperCase(), useruid: hlGamingUserUid, api: apiKey }),
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'The entered HL Gaming API key is not valid.' : `HL Gaming rejected the key with HTTP ${response.status}.`);
  const payload = await response.json();
  const root = payload?.result || payload?.data || payload;
  const account = root?.AccountInfo || root?.accountInfo || root?.basicInfo || {};
  if (!account.AccountName && !account.accountName) throw new Error('The entered HL Gaming API key is not valid.');
  return true;
}

function numberValue(...values) {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '');
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeFreeFireStats(payload, uid) {
  const root = payload?.result || payload?.data || payload;
  const account = root?.AccountInfo || root?.accountInfo || root?.basicInfo || {};
  const playerStats = root?.playerStats || root?.playerstats || root?.data || {};
  const career = playerStats.BR_CAREER || playerStats.brCareer || {};
  const csCareer = playerStats.CS_CAREER || playerStats.csCareer || {};
  const modes = [playerStats.solostats, playerStats.duostats, playerStats.quadstats, root?.soloStats, root?.duoStats, root?.quadStats, ...Object.values(career), csCareer].filter(Boolean);
  const accountId = account.AccountId || account.accountId || account.accountID || modes.find((mode) => mode.account_id || mode.accountId)?.account_id || (account.AccountName ? uid : '');
  const brRankPoints = numberValue(account.BrRankPoint, account.rankingPoints);
  const csRankPoints = numberValue(account.CsRankPoint, account.csRankingPoints);
  const matches = modes.reduce((total, mode) => total + numberValue(mode.gamesplayed, mode.gamesPlayed, mode.games_played), 0);
  const wins = modes.reduce((total, mode) => total + numberValue(mode.wins), 0);
  const eliminations = modes.reduce((total, mode) => total + numberValue(mode.kills), 0);
  const headshotKills = modes.reduce((total, mode) => total + numberValue(mode.detailedstats?.headshotkills, mode.detailedStats?.headshotKills, mode.total_headshots_kills, mode.headshotKills), 0);
  return {
    freeFireUid: String(accountId),
    nickname: account.AccountName || account.nickname || '',
    region: account.AccountRegion || account.region || '',
    likes: numberValue(account.AccountLikes, account.liked),
    brMaxRank: numberValue(account.BrMaxRank, account.maxRank),
    brRankPoints,
    csMaxRank: numberValue(account.CsMaxRank, account.csMaxRank),
    csRankPoints,
    accountLevel: numberValue(account.AccountLevel, account.level),
    matches,
    wins,
    eliminations,
    headshotKills,
    winRate: matches ? Number(((wins / matches) * 100).toFixed(2)) : 0,
    fetchedAt: new Date().toISOString(),
    provider: 'hlgaming',
  };
}

async function fetchFreeFireStats(uid, region, apiKey = hlGamingApiKey) {
  if (!getFreeFireStatsConfig(apiKey)) throw new Error('HL Gaming API credentials are not configured');
  const requestOptions = (body) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const [accountResponse, statsResponse] = await Promise.all([
    fetch(hlGamingAccountApiUrl, requestOptions({ sectionName: 'AllData', PlayerUid: uid, region: region.toUpperCase(), useruid: hlGamingUserUid, api: apiKey })),
    fetch(hlGamingStatsApiUrl, requestOptions({ sectionName: 'free_fire_stats', uid: String(uid), region: region.toUpperCase(), useruid: hlGamingUserUid, api: apiKey })),
  ]);
  if (!accountResponse.ok) throw new Error(`HL Gaming account API returned HTTP ${accountResponse.status}`);
  if (!statsResponse.ok) throw new Error(`HL Gaming stats API returned HTTP ${statsResponse.status}`);
  const accountPayload = await accountResponse.json();
  const statsPayload = await statsResponse.json();
  const stats = normalizeFreeFireStats({
    ...accountPayload,
    result: {
      ...(accountPayload.result || {}),
      playerStats: statsPayload.result?.data || statsPayload.data || {},
    },
  }, uid);
  if (stats.freeFireUid !== String(uid)) throw new Error('HL Gaming did not find this UID in the selected region. Confirm the UID and region, or contact HL Gaming because its region service may be unavailable.');
  return stats;
}

async function saveFreeFireStats(memberId, uid, region, apiKey = hlGamingApiKey) {
  const stats = await fetchFreeFireStats(uid, region, apiKey);
  const db = await getDatabase();
  const record = { id: memberId, memberId, ...stats, region };
  if (db) await db.collection(freeFireStatsCollection).replaceOne({ id: memberId }, record, { upsert: true });
  else saveLocalDocument(freeFireStatsCollection, record);
  return stats;
}

function getIndiaTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(now);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function weeklyRefreshKey(now = new Date()) {
  const time = getIndiaTime(now);
  return `${time.year}-${time.month}-${time.day}`;
}

async function removeExpiredHlGamingKeys() {
  const db = await getRankingDatabase();
  if (!db) return;
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.collection(hlGamingKeysCollection).deleteMany({
    $or: [
      { lastUsedAt: { $lt: cutoff } },
      { lastValidatedAt: { $lt: cutoff } },
      { expiresAt: { $lte: new Date().toISOString() } },
    ],
  });
}

async function refreshWeeklyFreeFireData() {
  await removeExpiredHlGamingKeys().catch((error) => console.warn(`HL Gaming key cleanup failed: ${error.message}`));
  const time = getIndiaTime();
  const config = await getHlGamingConfig();
  const websiteRoleKeys = Object.fromEntries(Object.keys(defaultRoleKeySettings).map((role) => [role, decryptApiKey(config?.roleApiKeys?.[role])]));
  const schedule = config.roleSettings.guildLeader;
  const [scheduledHour, scheduledMinute] = schedule.refreshTime.split(':').map(Number);
  const weekday = time.weekday.toLowerCase();
  if (weekday !== schedule.refreshDay.slice(0, 3) || Number(time.hour) !== scheduledHour || Number(time.minute) !== scheduledMinute) return;
  const runKey = weeklyRefreshKey();
  if (lastWeeklyStatsRefreshKey === runKey) return;
  lastWeeklyStatsRefreshKey = runKey;
  const db = await getDatabase();
  const settings = db
    ? await db.collection(collectionNames.settings).findOne({ id: 'guild' })
    : getLocalDocuments(collectionNames.settings).find((item) => item.id === 'guild');
  const ownerUid = settings?.guildOwnerUid;
  if (!ownerUid) return;
  const region = hlGamingRegion;
  const { maxMemberRefreshesPerKey: configuredMaxMemberRefreshes } = config;
  try {
    const [guildProfile, ownerStats] = await Promise.all([
      fetchGuildProfile(ownerUid, region, hlGamingApiKey),
      fetchFreeFireStats(ownerUid, region, hlGamingApiKey),
    ]);
    if (db) {
      await db.collection(guildProfileCollection).replaceOne({ id: 'guild' }, guildProfile, { upsert: true });
      const owner = await db.collection(collectionNames.members).findOne({ $or: [{ freeFireUid: ownerUid }, { isOwner: true }, { role: 'admin' }] });
      if (owner) await db.collection(collectionNames.members).updateOne({ id: owner.id }, { $set: { freeFireUid: ownerUid, stats: ownerStats } });
    } else saveLocalDocument(guildProfileCollection, guildProfile);
  } catch (error) {
    console.warn(`Weekly guild refresh failed: ${error.message}`);
  }
  const members = db
    ? await db.collection(collectionNames.members).find({ status: 'approved', freeFireUid: { $exists: true, $ne: '' } }).toArray()
    : getLocalDocuments(collectionNames.members).filter((item) => item.status === 'approved' && item.freeFireUid);
  const keys = [...new Set([...Object.values(websiteRoleKeys).filter(Boolean), ...hlGamingMemberApiKeys])];
  const usesByKey = new Map(keys.map((key) => [key, 0]));
  const sharedUsesByRole = new Map();
  for (const candidate of members) {
    if (candidate.freeFireUid === ownerUid) continue;
    const storedKey = await getStoredHlGamingKey(candidate.id);
    const personalKey = decryptApiKey(storedKey?.apiKeyEncrypted) || decryptApiKey(candidate.hlGamingApiKeyEncrypted);
    const roleSettings = config.roleSettings[candidate.role] || config.roleSettings.member;
    const refreshInterval = roleSettings.refreshEveryDays * 24 * 60 * 60 * 1000 || (personalKey ? 7 * 24 * 60 * 60 * 1000 : keylessRefreshIntervalMs);
    const lastRefreshAt = Date.parse(candidate.lastFreeFireStatsRefreshAt || '');
    if (lastRefreshAt && Date.now() - lastRefreshAt < refreshInterval) continue;
    if (personalKey && !usesByKey.has(personalKey)) usesByKey.set(personalKey, 0);
    const sharedKeyEligible = candidate.role === 'coadmin' || candidate.role === 'moderator' || candidate.role === 'member';
    const sharedMembersForRole = sharedUsesByRole.get(candidate.role) || 0;
    const roleKey = websiteRoleKeys[candidate.role];
    const key = personalKey && usesByKey.get(personalKey) < configuredMaxMemberRefreshes
      ? personalKey
      : roleKey && (usesByKey.get(roleKey) || 0) < configuredMaxMemberRefreshes
        ? roleKey
      : sharedKeyEligible && sharedMembersForRole < roleSettings.shareMemberCount ? keys.find((value) => (usesByKey.get(value) || 0) < configuredMaxMemberRefreshes) : null;
    if (!key) continue;
    try {
      const stats = await saveFreeFireStats(candidate.id, candidate.freeFireUid, candidate.application?.region || region, key);
      usesByKey.set(key, (usesByKey.get(key) || 0) + 1);
      if (!personalKey) sharedUsesByRole.set(candidate.role, sharedMembersForRole + 1);
      const refreshChanges = { stats, lastFreeFireStatsRefreshAt: new Date().toISOString() };
      if (db) await db.collection(collectionNames.members).updateOne({ id: candidate.id }, { $set: refreshChanges });
      else updateLocalDocument(collectionNames.members, candidate.id, refreshChanges);
      const rankingDb = await getRankingDatabase();
      if (personalKey && rankingDb) await rankingDb.collection(hlGamingKeysCollection).updateOne({ memberId: candidate.id }, { $set: { lastUsedAt: new Date().toISOString(), lastValidatedAt: new Date().toISOString() } });
    } catch (error) {
      if (personalKey && /not valid|HTTP 401|HTTP 403/i.test(error.message)) {
        const rankingDb = await getRankingDatabase();
        await rankingDb?.collection(hlGamingKeysCollection).deleteOne({ memberId: candidate.id });
      }
      console.warn(`Weekly member refresh failed for ${candidate.id}: ${error.message}`);
    }
  }
}

function normalizeGuildProfile(payload, region) {
  const root = payload?.result || payload?.data || payload;
  const guild = root?.GuildInfo || root?.guildInfo || root?.clanBasicInfo || root || {};
  const captain = root?.captainBasicInfo || root?.captainInfo || {};
  const guildId = String(guild.GuildID || guild.Guildid || guild.guildId || guild.clanId || '');
  if (!guildId || !guild.GuildName && !guild.guildName && !guild.clanName) throw new Error('HL Gaming did not return guild details');
  return {
    id: 'guild',
    guildId,
    guildName: guild.GuildName || guild.guildName || guild.clanName || '',
    guildLevel: numberValue(guild.GuildLevel, guild.guildLevel, guild.clanLevel),
    capacity: numberValue(guild.GuildCapacity, guild.capacity),
    memberCount: numberValue(guild.GuildMember, guild.memberNum, guild.memberCount),
    ownerId: String(guild.GuildOwner || guild.guildOwner || guild.captainId || ''),
    ownerName: guild.GuildOwnerName || captain.nickname || captain.AccountName || captain.accountName || 'Unknown',
    region: guild.region || region.toUpperCase(),
    refreshedAt: new Date().toISOString(),
  };
}

async function fetchGuildProfile(uid, region, apiKey = hlGamingGuildApiKey) {
  if (!getFreeFireStatsConfig(apiKey)) throw new Error('HL Gaming API credentials are not configured');
  const response = await fetch(hlGamingAccountApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sectionName: 'GuildInfo', PlayerUid: uid, region: region.toUpperCase(), useruid: hlGamingUserUid, api: apiKey }),
  });
  if (!response.ok) throw new Error(`HL Gaming API returned HTTP ${response.status}`);
  return normalizeGuildProfile(await response.json(), region);
}

async function getCachedGuildProfile(uid, region) {
  const db = await getDatabase();
  const cached = db
    ? await db.collection(guildProfileCollection).findOne({ id: 'guild' })
    : getLocalDocuments(guildProfileCollection).find((item) => item.id === 'guild');
  if (cached && Date.now() - Date.parse(cached.refreshedAt) < guildProfileRefreshMs) return cached;
  let profile;
  try {
    profile = await fetchGuildProfile(uid, region);
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
  if (db) await db.collection(guildProfileCollection).replaceOne({ id: 'guild' }, profile, { upsert: true });
  else saveLocalDocument(guildProfileCollection, profile);
  return profile;
}

function isRankingResource(resource) {
  return resource === 'ranking-tasks' || resource === 'ranking-scores';
}

function isRankingScoreResource(resource) {
  return resource === 'ranking-scores';
}

function getResourceDatabase(resource) {
  return isRankingResource(resource) ? getRankingDatabase() : getDatabase();
}

function readLocalStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(localDataPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

let localStore = readLocalStore();

function writeLocalStore() {
  fs.writeFileSync(localDataPath, JSON.stringify(localStore, null, 2));
}

function getLocalDocuments(collectionName) {
  return Array.isArray(localStore[collectionName]) ? localStore[collectionName] : [];
}

function saveLocalDocument(collectionName, document) {
  if (isProduction) throw new Error('Local data fallback is disabled in production.');
  const documents = getLocalDocuments(collectionName);
  const index = documents.findIndex((item) => item.id === document.id);
  if (index === -1) documents.push(document);
  else documents[index] = document;
  localStore[collectionName] = documents;
  writeLocalStore();
}

function updateLocalDocument(collectionName, id, changes) {
  if (isProduction) throw new Error('Local data fallback is disabled in production.');
  const documents = getLocalDocuments(collectionName);
  const index = documents.findIndex((item) => item.id === id);
  if (index === -1) return false;
  documents[index] = { ...documents[index], ...changes };
  localStore[collectionName] = documents;
  writeLocalStore();
  return true;
}

function removeLocalDocument(collectionName, id) {
  if (isProduction) throw new Error('Local data fallback is disabled in production.');
  const documents = getLocalDocuments(collectionName);
  localStore[collectionName] = documents.filter((item) => item.id !== id);
  writeLocalStore();
}

const defaultCharacter = {
  appearance: { base: 'Tactical', hairstyle: 'Crew Cut', face: 'Standard', skinTone: 'Tan' },
  outfit: { headwear: 'Combat Helmet', top: 'Tactical Vest', bottom: 'Cargo Pants', footwear: 'Combat Boots' },
  accessories: { mask: 'None', glasses: 'Tactical Goggles', back: 'None' },
  effects: { aura: 'None', cardEffect: 'Standard', entranceAnimation: 'Default' },
};

function getProfileAvatar(profile) {
  if (profile.avatar) return `/api/discord-avatar/${profile.id}/${profile.avatar}`;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.global_name || profile.username)}&background=f5a623&color=111827&size=200`;
}

function getSessionToken(request) {
  return request.headers.cookie?.match(/guild_session=([^;]+)/)?.[1];
}

function getCookie(request, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return request.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${escapedName}=([^;]*)`))?.[1];
}

function getSession(request) {
  const token = getSessionToken(request);
  return token ? sessions.get(token) || null : null;
}

function setSession(response, member, discordToken) {
  const safeMember = publicMember(member);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, safeMember);
  if (discordToken) discordAccessTokens.set(token, discordToken);
  const cookieOptions = `${process.env.NODE_ENV === 'production' ? 'HttpOnly; SameSite=Lax; Secure' : 'HttpOnly; SameSite=Lax'}; Path=/; Max-Age=${sessionMaxAgeSeconds}`;
  response.setHeader('Set-Cookie', [`guild_session=${token}; ${cookieOptions}`, 'guild_oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0']);
}

function requireSession(request, response) {
  const session = getSession(request);
  if (!session) {
    securityLog('unauthorized_request', request, { path: request.path });
    response.status(401).json({ error: 'Authentication required' });
    return null;
  }
  if (session.status === 'suspended') {
    securityLog('suspended_request', request, { memberId: session.id, path: request.path });
    response.status(403).json({ error: 'Suspended accounts cannot access this resource.' });
    return null;
  }
  return session;
}

const permissionRoles = {
  'member.read': new Set(['admin', 'coadmin', 'moderator', 'member', 'recruit']),
  'member.manage': new Set(['admin', 'coadmin']),
  'member.role.change': new Set(['admin']),
  'member.suspend': new Set(['admin', 'coadmin']),
  'settings.manage': new Set(['admin', 'coadmin']),
  'chat.moderate': new Set(['admin', 'coadmin']),
  'ranking.manage': new Set(['admin', 'coadmin']),
};

const tournamentFormats = new Set(['single_elimination']);
const tournamentStatuses = new Set(['draft', 'registration_open', 'registration_closed', 'active', 'completed', 'cancelled']);
const tournamentParticipantStatuses = new Set(['registered', 'withdrawn', 'disqualified']);
const tournamentTeamStatuses = new Set(['active', 'disbanded', 'cancelled']);
let tournamentParticipantIndexPromise = null;
const tournamentTeamLocks = new Map();
const tournamentMatchLocks = new Map();
const tournamentTeamsCollection = 'tournament_teams';
const tournamentMatchesCollection = 'tournament_matches';
const tournamentResultsCollection = 'tournament_results';
const tournamentStandingsCollection = 'tournament_standings';
const tournamentMatchStatuses = new Set(['pending', 'scheduled', 'live', 'completed', 'cancelled', 'disputed']);
const tournamentResultStatuses = new Set(['pending', 'verified']);

function hasPermission(session, permission) {
  return Boolean(session && permissionRoles[permission]?.has(session.role));
}

function requirePermission(request, response, permission) {
  const session = requireSession(request, response);
  if (!session) return null;
  if (!hasPermission(session, permission)) {
    securityLog('forbidden_request', request, { memberId: session.id, role: session.role, permission, path: request.path });
    if (permission === 'member.suspend') securityLog('suspension_authorization_denied', request, { memberId: session.id, role: session.role });
    response.status(403).json({ error: `Permission required: ${permission}` });
    return null;
  }
  return session;
}

function requireStaff(request, response) {
  return requirePermission(request, response, 'member.manage');
}

async function requireGuildOwner(request, response) {
  const session = requirePermission(request, response, 'member.role.change');
  if (!session) return null;
  const guild = discordBot?.guilds.cache.get(discordGuildId);
  if (!guild || guild.ownerId !== session.discordId) {
    securityLog('role_change_denied', request, { memberId: session.id, discordId: session.discordId, reason: 'not_guild_owner' });
    response.status(403).json({ error: 'Only the Discord guild owner can manage roles.' });
    return null;
  }
  return session;
}

function securityLog(event, request, details = {}) {
  console.warn(`[security] ${event}`, JSON.stringify({ method: request?.method, path: request?.path, ip: request?.socket?.remoteAddress, ...details }));
  void recordAuditEvent({
    eventType: event,
    source: details.source || 'security',
    request,
    actor: request ? getSession(request) : undefined,
    target: details.target || (details.targetMemberId ? { id: details.targetMemberId } : undefined),
    reason: details.reason,
    success: details.success !== false,
    metadata: details,
  });
}

function auditPrincipal(value) {
  if (!value) return undefined;
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    discordId: typeof value.discordId === 'string' ? value.discordId : undefined,
    name: typeof value.displayName === 'string' ? value.displayName : typeof value.discordName === 'string' ? value.discordName : typeof value.name === 'string' ? value.name : undefined,
    role: typeof value.role === 'string' ? value.role : undefined,
  };
}

function sanitizeAuditValue(value, depth = 0) {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value === 'string' ? value.slice(0, 500) : value;
  }
  if (depth >= 2 || !value || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeAuditValue(item, depth + 1));
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|secret|password|cookie|authorization|api.?key|credential|oauth|body/i.test(key)) continue;
    const sanitized = sanitizeAuditValue(item, depth + 1);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

async function recordAuditEvent({ eventType, action, source = 'system', request, actor, target, previousValue, newValue, reason, success = true, metadata } = {}) {
  const actorPrincipal = auditPrincipal(actor) || (source === 'system' || source === 'reconciliation' || source === 'scheduler' || source === 'discord' ? { name: source, role: 'system' } : undefined);
  const targetPrincipal = auditPrincipal(target);
  const requestId = request?.headers?.['x-request-id'];
  const document = {
    id: `audit-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
    timestamp: new Date().toISOString(),
    eventType: String(eventType || action || 'unknown').slice(0, 120),
    action: String(action || eventType || 'unknown').slice(0, 120),
    source: String(source).slice(0, 40),
    success: Boolean(success),
    actorId: actorPrincipal?.id,
    actorDiscordId: actorPrincipal?.discordId,
    actorName: actorPrincipal?.name,
    actorRole: actorPrincipal?.role,
    targetId: targetPrincipal?.id,
    targetDiscordId: targetPrincipal?.discordId,
    targetName: targetPrincipal?.name,
    previousValue: sanitizeAuditValue(previousValue),
    newValue: sanitizeAuditValue(newValue),
    reason: typeof reason === 'string' ? reason.slice(0, 500) : undefined,
    ipAddress: request?.socket?.remoteAddress,
    correlationId: typeof requestId === 'string' && /^[a-zA-Z0-9._:-]{1,120}$/.test(requestId) ? requestId : undefined,
    metadata: sanitizeAuditValue(metadata),
  };
  try {
    const db = await getDatabase();
    if (db) await db.collection(auditLogsCollection).insertOne(document);
    else saveLocalDocument(auditLogsCollection, document);
  } catch (error) {
    console.error(`[audit] audit persistence failed: ${error.message}`);
    try { saveLocalDocument(auditLogsCollection, document); } catch (fallbackError) { console.error(`[audit] local audit fallback failed: ${fallbackError.message}`); }
  }
}

function updateActiveMemberSessions(memberId, changes) {
  for (const [token, session] of sessions.entries()) {
    if (session.id === memberId) sessions.set(token, { ...session, ...changes });
  }
}

function closeMemberSockets(memberId) {
  for (const socket of webSocketClients) {
    const session = getSession(webSocketSessions.get(socket));
    if (session?.id === memberId && socket.readyState === WebSocket.OPEN) socket.close(1008, 'Authorization changed');
  }
}

async function getDiscordGuildRole(discordUserId) {
  if (!discordBotToken || !discordGuildId) return null;
  const guild = discordBot?.guilds.cache.get(discordGuildId);
  if (!guild) return null;
  const guildMember = await guild.members.fetch(discordUserId).catch(() => null);
  if (guildMember) discordLastInteractionAt = new Date().toISOString();
  if (!guildMember) return null;
  return getDiscordRoleData(guildMember);
}

async function getDiscordBio(token, userId) {
  const authorization = { Authorization: `${token.token_type} ${token.access_token}` };
  for (const endpoint of ['https://discord.com/api/v10/users/@me/profile', `https://discord.com/api/v10/users/${userId}/profile`]) {
    try {
      const profileResponse = await fetch(endpoint, { headers: authorization });
      if (!profileResponse.ok) continue;
      const profile = await profileResponse.json();
      const bio = profile.user_profile?.bio ?? profile.bio;
      if (typeof bio === 'string') return bio;
    } catch (_error) {
      // Try the next Discord profile endpoint.
    }
  }
  return '';
}

function getDiscordRoleData(guildMember) {
  const isOwner = guildMember.guild.ownerId === guildMember.id;
  if (guildMember.roles.cache.has(discordRoleIds.admin)) return { role: 'admin', isOwner };
  if (guildMember.roles.cache.has(discordRoleIds.coadmin) || guildMember.roles.cache.has(discordCoadminRoleId)) return { role: 'coadmin', isOwner };
  if (guildMember.roles.cache.has(discordRoleIds.moderator)) return { role: 'moderator', isOwner };
  if (guildMember.roles.cache.has(discordRoleIds.member)) return { role: 'member', isOwner };
  if (guildMember.roles.cache.has(discordRoleIds.members)) return { role: 'recruit', isOwner };
  return { role: 'recruit', isOwner };
}

function getDiscordProfileData(guildMember) {
  const user = guildMember.user;
  return {
    displayName: guildMember.displayName || user.globalName || user.username,
    discordName: user.discriminator && user.discriminator !== '0' ? `${user.username}#${user.discriminator}` : user.username,
    discordAvatar: user.avatar ? `/api/discord-avatar/${user.id}/${user.avatar}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(guildMember.displayName || user.username)}&background=f5a623&color=111827&size=256`,
  };
}

function getDiscordCustomStatus(presence) {
  const customStatus = presence?.activities?.find((activity) => activity.type === 4);
  return typeof customStatus?.state === 'string' ? customStatus.state : '';
}

async function ensureDiscordRoles() {
  if (!discordBot || !discordGuildId) return;
  const guild = await discordBot.guilds.fetch(discordGuildId);
  await guild.roles.fetch();
  for (const [role, name] of Object.entries(discordRoleNames)) {
    let discordRole = guild.roles.cache.find((candidate) => candidate.name === name);
    if (!discordRole) discordRole = await guild.roles.create({ name, reason: 'Free Fire Guild website role setup' });
    discordRoleIds[role] = discordRole.id;
    console.log(`Discord role ready: ${name}`);
  }
}

function managedRoleIds() {
  return [...new Set([...Object.values(discordRoleIds), discordCoadminRoleId].filter(Boolean))];
}

function managedRolesOnMember(guildMember) {
  return managedRoleIds().filter((roleId) => guildMember.roles.cache.has(roleId));
}

async function applyManagedDiscordRole(guildMember, role) {
  const targetRoleId = role === 'recruit' ? discordRoleIds.members : discordRoleIds[role];
  if (!targetRoleId) throw new Error(`Discord role mapping is unavailable for ${role}.`);
  const previous = discordRoleAssignmentLocks.get(role) || Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    const guild = guildMember.guild;
    const otherMembers = await guild.members.fetch();
    const assignedCount = otherMembers.filter((candidate) => candidate.id !== guildMember.id && candidate.roles.cache.has(targetRoleId)).size;
    if (roleMemberLimits[role] && assignedCount >= roleMemberLimits[role]) throw new Error(`${role} Discord role is full.`);
    const currentManagedRoles = managedRolesOnMember(guildMember);
    if (currentManagedRoles.length === 1 && currentManagedRoles[0] === targetRoleId) return false;
    discordRoleSyncInProgress.add(guildMember.id);
    try {
      await guildMember.roles.remove(managedRoleIds());
      await guildMember.roles.add(targetRoleId);
      return true;
    } finally {
      setTimeout(() => discordRoleSyncInProgress.delete(guildMember.id), 1000);
    }
  });
  discordRoleAssignmentLocks.set(role, current);
  try {
    return await current;
  } finally {
    if (discordRoleAssignmentLocks.get(role) === current) discordRoleAssignmentLocks.delete(role);
  }
}

async function withMemberReconciliationLock(discordId, operation) {
  const previous = memberReconciliationLocks.get(discordId) || Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  memberReconciliationLocks.set(discordId, current);
  try {
    return await current;
  } finally {
    if (memberReconciliationLocks.get(discordId) === current) memberReconciliationLocks.delete(discordId);
  }
}

async function findMemberByDiscordId(discordId) {
  const db = await getDatabase();
  return db?.collection(collectionNames.members).findOne({ discordId })
    || getLocalDocuments(collectionNames.members).find((member) => member.discordId === discordId);
}

async function findMemberById(memberId) {
  const db = await getDatabase();
  return db?.collection(collectionNames.members).findOne({ id: memberId })
    || getLocalDocuments(collectionNames.members).find((member) => member.id === memberId);
}

async function persistReconciledMember(memberId, changes) {
  try {
    const db = await getDatabase();
    if (db) await db.collection(collectionNames.members).updateOne({ id: memberId }, { $set: changes });
    else updateLocalDocument(collectionNames.members, memberId, changes);
  } catch (error) {
    console.error(`[sync] database write failed for ${memberId}: ${error.message}`);
    void recordAuditEvent({ eventType: 'database_sync_failed', action: 'database_sync_failed', source: 'reconciliation', actor: { name: 'reconciliation', role: 'system' }, target: { id: memberId }, success: false, reason: error.message, metadata: { synchronizationPending: true } });
    updateLocalDocument(collectionNames.members, memberId, { ...changes, discordSyncPending: true, discordSyncPendingAt: new Date().toISOString() });
  }
}

function cancelDiscordDepartureCleanup(memberId) {
  const timer = discordDepartureTimers.get(memberId);
  if (!timer) return;
  clearTimeout(timer);
  discordDepartureTimers.delete(memberId);
}

async function hasDiscordRoleInviteNotification(discordId, role) {
  if (discordRoleInviteNotifications.get(discordId) === role) return true;
  const db = await getDatabase();
  if (!db) return false;
  return Boolean(await db.collection(discordRoleInviteCollection).findOne({ discordId, role }));
}

async function recordDiscordRoleInviteNotification(discordId, role) {
  discordRoleInviteNotifications.set(discordId, role);
  try {
    const db = await getDatabase();
    await db?.collection(discordRoleInviteCollection).updateOne(
      { discordId, role },
      { $set: { discordId, role, sentAt: new Date().toISOString() } },
      { upsert: true },
    );
  } catch (error) {
    console.error(`[sync] onboarding notification marker write failed for ${discordId}: ${error.message}`);
  }
}

async function reconcileMember(discordId, options = {}) {
  lastSyncAttemptAt = new Date().toISOString();
  return withMemberReconciliationLock(discordId, async () => {
    const auditSource = options.source || 'reconciliation';
    const member = await findMemberByDiscordId(discordId);
    const guild = options.guildMember?.guild || discordBot?.guilds.cache.get(discordGuildId);
    if (!guild && discordBotToken && discordGuildId) throw new Error('Discord guild is unavailable for reconciliation.');
    const guildMember = options.guildMember || (guild ? await guild.members.fetch(discordId).catch(() => null) : null);
    const isInDiscordGuild = Boolean(guildMember);

    if (!member && !guildMember) {
      lastSyncSuccessAt = new Date().toISOString();
      return { discordId, exists: false, isInDiscordGuild: false };
    }

    if (!isInDiscordGuild) {
      if (!member) return { discordId, exists: false, isInDiscordGuild: false };
      const discordLeftAt = member.discordLeftAt || new Date().toISOString();
      const expired = options.forceDepartureCleanup || Date.parse(discordLeftAt) + discordDepartureGraceMs <= Date.now();
      const unsuspending = options.unsuspend === true;
      const finalRole = member.status === 'suspended' && !unsuspending || expired || options.forceRecruitOutsideGuild ? 'recruit' : (options.requestedRole || member.role);
      const finalStatus = unsuspending || expired ? 'pending' : member.status;
      const changes = { role: finalRole, status: finalStatus, isInDiscordGuild: false, presence: 'offline', isOnline: false, discordLeftAt, ...(unsuspending ? { suspendedFromRole: null } : {}) };
      if (member.isInDiscordGuild !== false) void recordAuditEvent({ eventType: 'member_left_discord', action: 'member_left_discord', source: auditSource, actor: { name: auditSource, role: 'system' }, target: member, previousValue: { role: member.role, status: member.status, isInDiscordGuild: true }, newValue: { role: finalRole, status: finalStatus, isInDiscordGuild: false }, reason: 'Discord guild membership is no longer present' });
      await persistReconciledMember(member.id, changes);
      updateActiveMemberSessions(member.id, changes);
      if (finalStatus === 'suspended' || expired) closeMemberSockets(member.id);
      if (!expired) scheduleDiscordMemberCleanup(member.id, discordId, discordLeftAt);
      if (expired && member.role !== 'recruit') void recordAuditEvent({ eventType: 'departure_cleanup', action: 'departure_cleanup', source: 'scheduler', actor: { name: 'scheduler', role: 'system' }, target: member, previousValue: { role: member.role, status: member.status }, newValue: { role: 'recruit', status: finalStatus }, reason: 'Discord departure grace period expired' });
      broadcast({ type: 'presence', discordId, status: 'offline', isOnline: false });
      broadcast({ type: 'role', discordId, role: finalRole, isOwner: false, memberStatus: finalStatus, isInDiscordGuild: false });
      lastSyncSuccessAt = new Date().toISOString();
      return { ...member, ...changes };
    }

    if (member) cancelDiscordDepartureCleanup(member.id);
    const roleData = getDiscordRoleData(guildMember);
    const assignedManagedRoles = managedRolesOnMember(guildMember);
    if (member?.isInDiscordGuild === false) void recordAuditEvent({ eventType: 'member_rejoined_discord', action: 'member_rejoined_discord', source: auditSource, actor: { name: auditSource, role: 'system' }, target: member, previousValue: { isInDiscordGuild: false }, newValue: { isInDiscordGuild: true }, reason: 'Discord member was found during reconciliation' });
    if (assignedManagedRoles.length > 1) console.warn(`[sync] Multiple managed Discord roles detected for ${discordId}; priority mapping will be applied.`);
    const unsuspending = options.unsuspend === true;
    let finalRole = member?.status === 'suspended' && !unsuspending ? 'recruit' : (options.requestedRole || roleData.role);
    if (member && !options.requestedRole && member.role !== finalRole) void recordAuditEvent({ eventType: 'discord_role_changed', action: 'discord_role_changed', source: auditSource, actor: { name: auditSource, role: 'system' }, target: member, previousValue: { role: member.role }, newValue: { role: finalRole }, reason: 'Discord managed role state changed' });
    const needsRoleCorrection = member?.status === 'suspended' || Boolean(options.requestedRole) || assignedManagedRoles.length !== 1 || roleData.role !== finalRole;
    if (member?.status === 'suspended' && roleData.role !== 'recruit') {
      console.warn(`[sync] Suspended Discord role correction for ${discordId}: ${roleData.role} -> recruit`);
    }
    if (needsRoleCorrection) {
      try {
        await applyManagedDiscordRole(guildMember, finalRole);
      } catch (error) {
        if (!error.message.includes('role is full') || finalRole === 'recruit') throw error;
        console.warn(`[sync] Role ${finalRole} is full for ${discordId}; assigning recruit.`);
        finalRole = 'recruit';
        await applyManagedDiscordRole(guildMember, finalRole);
      }
      if (roleData.role !== finalRole || assignedManagedRoles.length > 1) void recordAuditEvent({ eventType: 'discord_role_corrected', action: 'discord_role_corrected', source: auditSource, actor: { name: auditSource, role: 'system' }, target: member || { discordId }, previousValue: { role: roleData.role, managedRoleCount: assignedManagedRoles.length }, newValue: { role: finalRole }, reason: member?.status === 'suspended' ? 'suspended_user' : 'reconciliation' });
    }
    if (!member) {
      if (finalRole !== 'recruit' && !(await hasDiscordRoleInviteNotification(discordId, finalRole))) {
        const sent = await guildMember.send(`You have been given a guild role.\n\nPlease log in to the guild website to activate your account:\n${appUrl}`).then(() => true).catch((error) => {
          console.warn(`[sync] Onboarding DM failed for ${discordId}: ${error.message}`);
          return false;
        });
        if (sent) await recordDiscordRoleInviteNotification(discordId, finalRole);
        void recordAuditEvent({ eventType: sent ? 'onboarding_dm_sent' : 'onboarding_dm_failed', action: sent ? 'onboarding_dm_sent' : 'onboarding_dm_failed', source: 'discord', actor: { name: 'discord', role: 'system' }, target: { discordId }, success: sent, reason: sent ? 'Managed Discord role assigned to unknown user' : 'Discord DM could not be delivered', newValue: { role: finalRole } });
      }
      lastSyncSuccessAt = new Date().toISOString();
      return { discordId, exists: false, isInDiscordGuild: true, role: finalRole };
    }
    const finalStatus = member.status === 'suspended' && !unsuspending ? 'suspended' : finalRole === 'recruit' ? (unsuspending ? 'pending' : member.status) : 'approved';
    const changes = {
      role: finalRole,
      status: finalStatus,
      isOwner: roleData.isOwner,
      isInDiscordGuild: true,
      discordLeftAt: null,
      presence: guildMember.presence?.status || 'offline',
      isOnline: Boolean(guildMember.presence?.status && guildMember.presence.status !== 'offline'),
      discordSyncPending: false,
      discordSyncPendingAt: null,
      ...(unsuspending ? { suspendedFromRole: null } : {}),
      ...getDiscordProfileData(guildMember),
    };
    if (member.discordSyncPending) void recordAuditEvent({ eventType: 'synchronization_recovered', action: 'synchronization_recovered', source: auditSource, actor: { name: auditSource, role: 'system' }, target: member, previousValue: { synchronizationPending: true }, newValue: { synchronizationPending: false }, reason: 'Reconciliation completed successfully' });
    await persistReconciledMember(member.id, changes);
    updateActiveMemberSessions(member.id, changes);
    if (finalStatus === 'suspended') closeMemberSockets(member.id);
    broadcast({ type: 'role', discordId, role: finalRole, isOwner: roleData.isOwner, memberStatus: finalStatus, isInDiscordGuild: true });
    broadcast({ type: 'presence', discordId, status: changes.presence, isOnline: changes.isOnline });
    broadcast({ type: 'profile', discordId, ...getDiscordProfileData(guildMember) });
    lastSyncSuccessAt = new Date().toISOString();
    return { ...member, ...changes };
  });
}

async function markDiscordMemberAbsent(discordUserId) {
  const member = await findMemberByDiscordId(discordUserId);
  if (!member) return;
  const discordLeftAt = member.discordLeftAt || new Date().toISOString();
  const changes = { isInDiscordGuild: false, presence: 'offline', isOnline: false, discordLeftAt };
  void recordAuditEvent({ eventType: 'member_left_discord', action: 'member_left_discord', source: 'discord', actor: { name: 'discord', role: 'system' }, target: member, previousValue: { isInDiscordGuild: member.isInDiscordGuild, role: member.role, status: member.status }, newValue: { isInDiscordGuild: false, presence: 'offline' }, reason: 'Discord GuildMemberRemove event' });
  await persistReconciledMember(member.id, changes);
  updateActiveMemberSessions(member.id, changes);
  broadcast({ type: 'presence', discordId: discordUserId, status: 'offline', isOnline: false });
  scheduleDiscordMemberCleanup(member.id, discordUserId, discordLeftAt);
}

function scheduleDiscordMemberCleanup(memberId, discordUserId, discordLeftAt) {
  if (discordDepartureTimers.has(memberId)) return;
  const remaining = Math.max(0, Date.parse(discordLeftAt) + discordDepartureGraceMs - Date.now());
  const timer = setTimeout(async () => {
    discordDepartureTimers.delete(memberId);
    await reconcileMember(discordUserId, { forceDepartureCleanup: true }).catch((error) => {
      lastSyncFailureAt = new Date().toISOString();
      void recordAuditEvent({ eventType: 'reconciliation_failed', action: 'reconciliation_failed', source: 'scheduler', actor: { name: 'scheduler', role: 'system' }, target: { discordId: discordUserId }, success: false, reason: error.message });
      console.error(`[sync] Departure reconciliation failed for ${discordUserId}: ${error.message}`);
    });
  }, remaining);
  discordDepartureTimers.set(memberId, timer);
}

async function restoreDiscordDepartureTimers() {
  await processDiscordDepartures();
}

async function processDiscordDepartures() {
  const db = await getDatabase();
  const departedMembers = db
    ? await db.collection(collectionNames.members).find({ isInDiscordGuild: false, discordLeftAt: { $exists: true } }).toArray()
    : getLocalDocuments(collectionNames.members).filter((member) => member.isInDiscordGuild === false && member.discordLeftAt);
  for (const member of departedMembers || []) {
    if (Date.parse(member.discordLeftAt) + discordDepartureGraceMs <= Date.now()) {
      await reconcileMember(member.discordId, { forceDepartureCleanup: true }).catch((error) => {
        lastSyncFailureAt = new Date().toISOString();
        void recordAuditEvent({ eventType: 'reconciliation_failed', action: 'reconciliation_failed', source: 'scheduler', actor: { name: 'scheduler', role: 'system' }, target: member, success: false, reason: error.message });
        console.error(`[sync] Persistent departure reconciliation failed for ${member.discordId}: ${error.message}`);
      });
    } else {
      scheduleDiscordMemberCleanup(member.id, member.discordId, member.discordLeftAt);
    }
  }
}

async function isDiscordGuildMember(discordUserId) {
  if (!discordBotToken || !discordGuildId) return true;
  const cachedGuildMember = discordBot?.guilds.cache.get(discordGuildId)?.members.cache.get(discordUserId);
  if (cachedGuildMember) return true;
  try {
    const response = await fetch(`https://discord.com/api/guilds/${discordGuildId}/members/${discordUserId}`, {
      headers: { Authorization: `Bot ${discordBotToken}` },
    });
    if (response.status === 404) return false;
    if (!response.ok) return false;
    discordLastInteractionAt = new Date().toISOString();
    return true;
  } catch (error) {
    console.warn(`Discord membership check unavailable: ${error.message}`);
    return true;
  }
}

app.get('/api/discord-avatar/:userId/:hash', async (request, response) => {
  const { userId, hash } = request.params;
  if (!/^\d+$/.test(userId) || !/^[a-zA-Z0-9_]+$/.test(hash)) return response.status(400).end();
  try {
    const avatarResponse = await fetch(`https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=256`);
    if (!avatarResponse.ok) return response.status(404).end();
    response.setHeader('Content-Type', avatarResponse.headers.get('content-type') || 'image/png');
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.send(Buffer.from(await avatarResponse.arrayBuffer()));
  } catch (_error) {
    response.status(502).end();
  }
});

app.get('/auth/discord', (_request, response) => {
  if (!discordClientId || !discordClientSecret) return response.status(503).send('Discord OAuth is not configured. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.');
  const state = crypto.randomBytes(24).toString('hex');
  oauthStates.set(state, { expiresAt: Date.now() + 10 * 60 * 1000 });
  for (const [storedState, value] of oauthStates.entries()) {
    if (value.expiresAt <= Date.now()) oauthStates.delete(storedState);
  }
  const stateCookie = `guild_oauth_state=${state}; ${process.env.NODE_ENV === 'production' ? 'HttpOnly; SameSite=Lax; Secure' : 'HttpOnly; SameSite=Lax'}; Path=/; Max-Age=600`;
  response.setHeader('Set-Cookie', stateCookie);
  const params = new URLSearchParams({ client_id: discordClientId, response_type: 'code', redirect_uri: discordRedirectUri, scope: 'identify', state });
  response.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

app.get('/auth/discord/callback', async (request, response) => {
  const { code, error, state } = request.query;
  const stateRecord = typeof state === 'string' ? oauthStates.get(state) : null;
  const stateCookie = getCookie(request, 'guild_oauth_state');
  if (error || !code || typeof state !== 'string' || !stateRecord || stateRecord.expiresAt <= Date.now() || stateCookie !== state) {
    securityLog('invalid_oauth_state', request);
    if (typeof state === 'string') oauthStates.delete(state);
    return response.redirect(`${appUrl}/?auth_error=discord_cancelled`);
  }
  oauthStates.delete(state);
  try {
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: discordClientId, client_secret: discordClientSecret, grant_type: 'authorization_code', code, redirect_uri: discordRedirectUri }),
    });
    if (!tokenResponse.ok) throw new Error('Discord token exchange failed');
    const token = await tokenResponse.json();
    const profileResponse = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `${token.token_type} ${token.access_token}` } });
    if (!profileResponse.ok) throw new Error('Discord profile request failed');
    const profile = await profileResponse.json();
    const discordBio = typeof profile.bio === 'string' ? profile.bio : await getDiscordBio(token, profile.id);
    const isInDiscordGuild = await isDiscordGuildMember(profile.id);
    const discordRole = isInDiscordGuild ? await getDiscordGuildRole(profile.id) : null;
    const discordGuild = discordBot?.guilds.cache.get(discordGuildId);
    const discordGuildMember = isInDiscordGuild && discordGuild ? await discordGuild.members.fetch(profile.id).catch(() => null) : null;
    const presence = discordGuildMember?.presence?.status || 'offline';
    const role = discordRole?.role || 'recruit';
    const isOwner = discordRole?.isOwner || false;
    const db = await getDatabase();
    const membersCollection = db?.collection(collectionNames.members);
    let member = await membersCollection?.findOne({ discordId: profile.id });
    const isNewMember = !member;
    if (!member) {
      member = {
        id: `discord_${profile.id}`,
        discordId: profile.id,
        displayName: profile.global_name || profile.username,
        discordName: profile.discriminator && profile.discriminator !== '0' ? `${profile.username}#${profile.discriminator}` : profile.username,
        avatar: getProfileAvatar(profile),
        discordDisplayName: profile.global_name || profile.username,
        discordAvatar: getProfileAvatar(profile),
        discordBio,
        role,
        isOwner,
        isInDiscordGuild,
        status: 'approved',
        joinDate: new Date().toISOString().slice(0, 10),
        rank: 'Recruit',
        bio: 'Discord member awaiting guild access.',
        achievements: [],
        stats: { matches: 0, winRate: 0, eliminations: 0, booyahs: 0, accountLevel: 0, headshotRate: 0 },
        character: defaultCharacter,
        isOnline: presence !== 'offline',
        presence,
      };
      await membersCollection?.replaceOne({ id: member.id }, member, { upsert: true });
    } else if (member.role !== (isInDiscordGuild ? role : (member.role || 'recruit')) || member.isOwner !== isOwner || member.isInDiscordGuild !== isInDiscordGuild) {
      const syncedRole = isInDiscordGuild ? role : (member.role || 'recruit');
      const syncedStatus = member.status === 'suspended' ? 'suspended' : 'approved';
      member = { ...member, role: member.status === 'suspended' ? 'recruit' : syncedRole, status: syncedStatus, isOwner, isInDiscordGuild };
      await membersCollection?.updateOne({ id: member.id }, { $set: { role: member.role, status: member.status, isOwner, isInDiscordGuild } });
    } else if (member.discordDisplayName !== (profile.global_name || profile.username) || member.discordAvatar !== getProfileAvatar(profile)) {
      member = {
        ...member,
        discordDisplayName: profile.global_name || profile.username,
        discordAvatar: getProfileAvatar(profile),
      };
      await membersCollection?.updateOne({ id: member.id }, { $set: { discordDisplayName: member.discordDisplayName, discordAvatar: member.discordAvatar } });
    }
    if (member) {
      const syncedDiscordBio = discordBio || member.discordBio || '';
      const refreshedProfile = {
        discordDisplayName: profile.global_name || profile.username,
        discordAvatar: getProfileAvatar(profile),
        displayName: profile.global_name || profile.username,
        discordName: profile.discriminator && profile.discriminator !== '0' ? `${profile.username}#${profile.discriminator}` : profile.username,
        avatar: getProfileAvatar(profile),
        discordBio: syncedDiscordBio,
      };
      member = { ...member, ...refreshedProfile, presence, isOnline: presence !== 'offline' };
      await membersCollection?.updateOne({ id: member.id }, { $set: { ...refreshedProfile, presence, isOnline: presence !== 'offline' } });
    }
    if (discordGuild && (discordGuildMember || !isInDiscordGuild)) {
      const reconciledMember = await reconcileMember(profile.id, { guildMember: discordGuildMember || undefined, source: 'oauth' });
      if (reconciledMember?.id) member = { ...member, ...reconciledMember };
    }
    if (member.role === 'recruit' && member.status === 'pending') {
      member = { ...member, status: 'approved' };
      await membersCollection?.updateOne({ id: member.id }, { $set: { status: 'approved' } });
    }
    if (isNewMember && !isInDiscordGuild && member.role === 'recruit' && member.status !== 'approved') {
      member = { ...member, status: 'approved' };
      if (membersCollection) await membersCollection.updateOne({ id: member.id }, { $set: { status: 'approved' } });
    }
    broadcastMemberUpdate(member);
    void recordAuditEvent({ eventType: 'authentication_success', action: 'login', source: 'oauth', request, actor: member, target: member, newValue: { role: member.role, status: member.status } });
    setSession(response, member, token);
    response.redirect(`${appUrl}/?auth=success`);
  } catch (oauthError) {
    securityLog('authentication_failed', request, { reason: oauthError.message });
    console.error('Discord OAuth error:', oauthError.message);
    response.redirect(`${appUrl}/?auth_error=discord_failed`);
  }
});

app.get('/api/auth/me', async (request, response) => {
  const token = request.headers.cookie?.match(/guild_session=([^;]+)/)?.[1];
  const member = token ? sessions.get(token) : null;
  if (!member) return response.status(401).json({ authenticated: false });
  const storedMember = await getDatabase().then((db) => db?.collection(collectionNames.members).findOne({ id: member.id })).catch(() => null)
    || getLocalDocuments(collectionNames.members).find((item) => item.id === member.id);
  if (member.status === 'suspended' || storedMember?.status === 'suspended') {
    sessions.delete(token);
    discordAccessTokens.delete(token);
    closeMemberSockets(member.id);
    return response.status(401).json({ authenticated: false, reason: 'suspended' });
  }
  const isInDiscordGuild = await isDiscordGuildMember(member.discordId);
  const discordRole = isInDiscordGuild ? await getDiscordGuildRole(member.discordId) : null;
  const discordGuild = discordBot?.guilds.cache.get(discordGuildId);
  const discordGuildMember = isInDiscordGuild && discordGuild ? await discordGuild.members.fetch(member.discordId).catch(() => null) : null;
  const presence = discordGuildMember?.presence?.status || 'offline';
  const hasHlGamingApiKey = Boolean((await getStoredHlGamingKey(member.id))?.apiKeyEncrypted);
  if (discordGuild && (discordGuildMember || !isInDiscordGuild)) {
    try {
      const reconciledMember = await reconcileMember(member.discordId, { guildMember: discordGuildMember || undefined, source: 'session' });
      if (reconciledMember?.id) {
        const refreshedMember = { ...reconciledMember, hasHlGamingApiKey };
        sessions.set(token, refreshedMember);
        return response.json({ authenticated: true, member: refreshedMember });
      }
    } catch (error) {
      lastSyncFailureAt = new Date().toISOString();
      void recordAuditEvent({ eventType: 'reconciliation_failed', action: 'reconciliation_failed', source: 'session', actor: member, target: member, success: false, reason: error.message });
      console.error(`[sync] Session reconciliation failed for ${member.discordId}: ${error.message}`);
    }
  }
  if (discordRole) {
    const refreshedMember = {
      ...member,
      role: discordRole.role,
      isOwner: discordRole.isOwner,
      status: isInDiscordGuild ? (discordRole.role === 'recruit' ? member.status : 'approved') : 'pending',
      isInDiscordGuild,
      presence,
      isOnline: presence !== 'offline',
      hasHlGamingApiKey,
    };
    sessions.set(token, refreshedMember);
    try {
      const db = await getDatabase();
      await db?.collection(collectionNames.members).updateOne(
        { id: refreshedMember.id },
        { $set: { role: refreshedMember.role, isOwner: refreshedMember.isOwner, status: refreshedMember.status, presence, isOnline: presence !== 'offline' } },
      );
    } catch (_error) {
      // The refreshed Discord role is still returned to the current session.
    }
    return response.json({ authenticated: true, member: refreshedMember });
  }
  const refreshedMember = { ...member, role: member.role || 'recruit', isOwner: false, status: 'pending', isInDiscordGuild, presence, isOnline: false, hasHlGamingApiKey };
  sessions.set(token, refreshedMember);
  response.json({ authenticated: true, member: refreshedMember });
});

app.post('/api/auth/logout', (request, response) => {
  const token = getSessionToken(request);
  const session = getSession(request);
  if (token) {
    sessions.delete(token);
    discordAccessTokens.delete(token);
  }
  if (session) void recordAuditEvent({ eventType: 'logout', action: 'logout', source: 'oauth', request, actor: session, target: session });
  const expiredCookieOptions = process.env.NODE_ENV === 'production' ? 'HttpOnly; SameSite=None; Secure; Path=/; Max-Age=0' : 'HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
  response.setHeader('Set-Cookie', [`guild_session=; ${expiredCookieOptions}`, `guild_session_data=; ${expiredCookieOptions}`]);
  response.status(204).end();
});

app.post('/api/auth/delete-account', async (request, response) => {
  const token = getSessionToken(request);
  const session = token ? sessions.get(token) : null;
  if (!session) return response.status(401).json({ error: 'Authentication required' });
  try {
    const primaryDb = await getDatabase();
    const rankingDb = await getRankingDatabase();
    const chatDb = await getChatDatabase();
    if (primaryDb) {
      await primaryDb.collection(collectionNames.members).deleteOne({ id: session.id });
      await primaryDb.collection(freeFireStatsCollection).deleteMany({ $or: [{ id: session.id }, { memberId: session.id }] });
    } else {
      removeLocalDocument(collectionNames.members, session.id);
      localStore[freeFireStatsCollection] = getLocalDocuments(freeFireStatsCollection).filter((item) => item.id !== session.id && item.memberId !== session.id);
      writeLocalStore();
    }
    if (rankingDb) {
      await rankingDb.collection(collectionNames['ranking-scores']).deleteMany({ memberId: session.id });
      await rankingDb.collection(hlGamingKeysCollection).deleteMany({ memberId: session.id });
    } else {
      localStore[collectionNames['ranking-scores']] = getLocalDocuments(collectionNames['ranking-scores']).filter((item) => item.memberId !== session.id);
      localStore[hlGamingKeysCollection] = getLocalDocuments(hlGamingKeysCollection).filter((item) => item.memberId !== session.id);
      writeLocalStore();
    }
    if (chatDb) {
      await chatDb.collection('chat_messages').deleteMany({ $or: [{ authorId: session.id }, { recipientId: session.id }] });
    } else {
      localStore.chat_messages = getLocalDocuments('chat_messages').filter((item) => item.authorId !== session.id && item.recipientId !== session.id);
      writeLocalStore();
    }
    for (const [sessionToken, activeSession] of sessions.entries()) {
      if (activeSession.id === session.id) {
        sessions.delete(sessionToken);
        discordAccessTokens.delete(sessionToken);
      }
    }
    const expiredCookieOptions = process.env.NODE_ENV === 'production' ? 'HttpOnly; SameSite=None; Secure; Path=/; Max-Age=0' : 'HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
    response.setHeader('Set-Cookie', [`guild_session=; ${expiredCookieOptions}`, `guild_session_data=; ${expiredCookieOptions}`]);
    response.status(204).end();
  } catch (error) {
    response.status(500).json({ error: `Account deletion failed: ${error.message}` });
  }
});

app.get('/api/health', async (_request, response) => {
  const [db, rankingDb, chatDb] = await Promise.all([
    getDatabase(),
    getRankingDatabase(),
    getChatDatabase(),
  ]);
  const databases = {
    primary: Boolean(db),
    ranking: Boolean(rankingDb),
    chat: Boolean(chatDb),
  };
  response.json({
    database: databases.primary,
    databases,
    chatStorage: chatUsingPrimaryDatabase ? 'primary' : databases.chat ? 'dedicated' : 'local',
    mongoConnected: Object.values(databases).every(Boolean),
    status: Object.values(databases).every(Boolean) ? 'ok' : 'degraded',
  });
});

async function getHealthMemberSnapshot(db) {
  const now = Date.now();
  const graceCutoff = new Date(now - discordDepartureGraceMs).toISOString();
  const empty = { pendingSync: 0, oldestPendingSyncAt: null, graceMembers: 0, oldestDepartureAt: null, suspended: 0, suspendedInDiscord: 0, suspendedOutsideDiscord: 0, approvedOutsideDiscord: 0, approvedInDiscord: 0, roleCounts: { admin: 0, coadmin: 0, moderator: 0, member: 0 } };
  if (!db) {
    const members = getLocalDocuments(collectionNames.members);
    const pending = members.filter((member) => member.discordSyncPending);
    const grace = members.filter((member) => member.isInDiscordGuild === false && member.discordLeftAt && Date.parse(member.discordLeftAt) + discordDepartureGraceMs > now);
    const suspended = members.filter((member) => member.status === 'suspended');
    return {
      ...empty,
      pendingSync: pending.length,
      oldestPendingSyncAt: pending.map((member) => member.discordSyncPendingAt).filter(Boolean).sort()[0] || null,
      graceMembers: grace.length,
      oldestDepartureAt: grace.map((member) => member.discordLeftAt).sort()[0] || null,
      suspended: suspended.length,
      suspendedInDiscord: suspended.filter((member) => member.isInDiscordGuild !== false).length,
      suspendedOutsideDiscord: suspended.filter((member) => member.isInDiscordGuild === false).length,
      approvedOutsideDiscord: members.filter((member) => member.status === 'approved' && member.isInDiscordGuild === false).length,
      approvedInDiscord: members.filter((member) => member.status === 'approved' && member.isInDiscordGuild !== false).length,
      roleCounts: Object.fromEntries(Object.keys(empty.roleCounts).map((role) => [role, members.filter((member) => member.role === role).length])),
    };
  }
  const [pendingSync, oldestPending, graceMembers, oldestDeparture, suspended, suspendedInDiscord, suspendedOutsideDiscord, approvedOutsideDiscord, approvedInDiscord, ...roleCounts] = await Promise.all([
    db.collection(collectionNames.members).countDocuments({ discordSyncPending: true }),
    db.collection(collectionNames.members).find({ discordSyncPending: true, discordSyncPendingAt: { $exists: true } }).sort({ discordSyncPendingAt: 1 }).project({ discordSyncPendingAt: 1 }).limit(1).next(),
    db.collection(collectionNames.members).countDocuments({ isInDiscordGuild: false, discordLeftAt: { $gt: graceCutoff } }),
    db.collection(collectionNames.members).find({ isInDiscordGuild: false, discordLeftAt: { $exists: true } }).sort({ discordLeftAt: 1 }).project({ discordLeftAt: 1 }).limit(1).next(),
    db.collection(collectionNames.members).countDocuments({ status: 'suspended' }),
    db.collection(collectionNames.members).countDocuments({ status: 'suspended', isInDiscordGuild: { $ne: false } }),
    db.collection(collectionNames.members).countDocuments({ status: 'suspended', isInDiscordGuild: false }),
    db.collection(collectionNames.members).countDocuments({ status: 'approved', isInDiscordGuild: false }),
    db.collection(collectionNames.members).countDocuments({ status: 'approved', isInDiscordGuild: { $ne: false } }),
    ...Object.keys(empty.roleCounts).map((role) => db.collection(collectionNames.members).countDocuments({ role, status: 'approved' })),
  ]);
  return {
    ...empty,
    pendingSync,
    oldestPendingSyncAt: oldestPending?.discordSyncPendingAt || null,
    graceMembers,
    oldestDepartureAt: oldestDeparture?.discordLeftAt || null,
    suspended,
    suspendedInDiscord,
    suspendedOutsideDiscord,
    approvedOutsideDiscord,
    approvedInDiscord,
    roleCounts: Object.fromEntries(Object.keys(empty.roleCounts).map((role, index) => [role, roleCounts[index]])),
  };
}

function healthStatus({ discord, database, pendingSync, oldestPendingSyncAt, recentFailures, graceMembers }) {
  const now = Date.now();
  const pendingAge = oldestPendingSyncAt ? now - Date.parse(oldestPendingSyncAt) : 0;
  const discordOutageMs = discord.unavailableSince && !discord.ready ? now - Date.parse(discord.unavailableSince) : 0;
  const databaseOutageMs = database.unavailableSince ? now - Date.parse(database.unavailableSince) : 0;
  const critical = Boolean(database.configured && !database.available && database.unavailableSince && databaseOutageMs > 5 * 60 * 1000)
    || Boolean(discord.configured && !discord.ready && discord.unavailableSince && discordOutageMs > 10 * 60 * 1000)
    || pendingSync > 50
    || pendingAge > 24 * 60 * 60 * 1000
    || recentFailures > 25;
  if (critical) return 'CRITICAL';
  const degraded = Boolean(database.fallbackActive)
    || Boolean(discord.configured && (!discord.ready || !discord.guildAvailable))
    || pendingSync > 0
    || pendingAge > 60 * 60 * 1000
    || recentFailures > 0
    || graceMembers > 0;
  return degraded ? 'DEGRADED' : 'HEALTHY';
}

app.get('/api/admin/system-health', async (request, response) => {
  const session = requirePermission(request, response, 'settings.manage');
  if (!session) return;
  try {
    const db = await getDatabase();
    const memberSnapshot = await getHealthMemberSnapshot(db);
    const guild = discordBot?.isReady() && discordGuildId ? discordBot.guilds.cache.get(discordGuildId) : null;
    const failureSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const localAuditEvents = getLocalDocuments(auditLogsCollection);
    const recentFailures = db
      ? await db.collection(auditLogsCollection).countDocuments({ success: false, timestamp: { $gte: failureSince } })
      : localAuditEvents.filter((event) => event.success === false && event.timestamp >= failureSince).length;
    const recentFailureEvents = db
      ? await db.collection(auditLogsCollection).find({ success: false }).sort({ timestamp: -1 }).limit(10).project({ _id: 0, id: 1, timestamp: 1, eventType: 1, action: 1, source: 1, targetName: 1, reason: 1, success: 1 }).toArray()
      : localAuditEvents.filter((event) => event.success === false).sort((first, second) => second.timestamp.localeCompare(first.timestamp)).slice(0, 10);
    const discord = {
      configured: Boolean(discordBotToken && discordGuildId),
      state: discordConnectionState,
      ready: Boolean(discordBot?.isReady()),
      guildAvailable: Boolean(guild),
      guildId: discordGuildId || null,
      memberCount: guild?.memberCount || null,
      latencyMs: typeof discordBot?.ws?.ping === 'number' ? discordBot.ws.ping : null,
      lastReadyAt: discordLastReadyAt,
      lastErrorAt: discordLastErrorAt,
      lastInteractionAt: discordLastInteractionAt,
      unavailableSince: discordConnectionState === 'ready' && guild ? null : discordLastErrorAt || discordLastReadyAt || null,
    };
    const database = {
      configured: Boolean(mongoUrl),
      available: Boolean(db),
      fallbackActive: !db && Boolean(mongoUrl),
      fallbackWarning: !db && Boolean(mongoUrl) ? 'Database fallback active — persistent data may not survive redeployment.' : null,
      auditStorageAvailable: Boolean(db) || localAuditEvents.length >= 0,
      lastSuccessAt: lastDatabaseSuccessAt,
      unavailableSince: databaseUnavailableSince,
    };
    const status = healthStatus({ discord, database, pendingSync: memberSnapshot.pendingSync, oldestPendingSyncAt: memberSnapshot.oldestPendingSyncAt, recentFailures, graceMembers: memberSnapshot.graceMembers });
    response.json({ status, checkedAt: new Date().toISOString(), discord, database, synchronization: { ...memberSnapshot, lastAttemptAt: lastSyncAttemptAt, lastSuccessAt: lastSyncSuccessAt, lastFailureAt: lastSyncFailureAt, recentFailures, recentFailureEvents }, lifecycle: { graceMembers: memberSnapshot.graceMembers, oldestDepartureAt: memberSnapshot.oldestDepartureAt, suspended: memberSnapshot.suspended, suspendedInDiscord: memberSnapshot.suspendedInDiscord, suspendedOutsideDiscord: memberSnapshot.suspendedOutsideDiscord, approvedOutsideDiscord: memberSnapshot.approvedOutsideDiscord, approvedInDiscord: memberSnapshot.approvedInDiscord }, capacity: Object.fromEntries(Object.entries(memberSnapshot.roleCounts).map(([role, count]) => [role, { count, limit: roleMemberLimits[role] }])), websocket: { authenticatedClients: webSocketClients.size } });
  } catch (error) {
    void recordAuditEvent({ eventType: 'health_check_failed', action: 'health_check_failed', source: 'admin', request, actor: session, success: false, reason: error.message });
    response.status(503).json({ error: 'System health is temporarily unavailable.' });
  }
});

app.get('/api/admin/sync-health', async (request, response) => {
  const session = requirePermission(request, response, 'settings.manage');
  if (!session) return;
  const filter = typeof request.query.filter === 'string' ? request.query.filter : 'pending';
  if (!['pending', 'failed', 'stale', 'suspended', 'departure-grace'].includes(filter)) return response.status(400).json({ error: 'Invalid synchronization filter.' });
  const pageValue = Number.parseInt(String(request.query.page || '1'), 10);
  const limitValue = Number.parseInt(String(request.query.limit || '25'), 10);
  const page = Number.isInteger(pageValue) ? Math.min(Math.max(pageValue, 1), 100000) : 1;
  const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 100) : 25;
  const staleAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const graceAfter = new Date(Date.now() - discordDepartureGraceMs).toISOString();
  const baseQuery = filter === 'pending' ? { discordSyncPending: true }
    : filter === 'failed' ? { discordSyncPending: true, $or: [{ status: 'pending' }, { status: 'rejected' }, { status: 'suspended' }] }
    : filter === 'stale' ? { discordSyncPending: true, discordSyncPendingAt: { $lte: staleAt } }
    : filter === 'suspended' ? { status: 'suspended' }
    : { isInDiscordGuild: false, discordLeftAt: { $gt: graceAfter } };
  try {
    const db = await getDatabase();
    const localMembers = getLocalDocuments(collectionNames.members);
    const documents = db
      ? await db.collection(collectionNames.members).find(baseQuery).sort({ discordSyncPendingAt: 1, discordLeftAt: 1 }).skip((page - 1) * limit).limit(limit).toArray()
      : localMembers.filter((member) => {
          if (filter === 'pending') return Boolean(member.discordSyncPending);
          if (filter === 'failed') return Boolean(member.discordSyncPending) && ['pending', 'rejected', 'suspended'].includes(member.status);
          if (filter === 'stale') return Boolean(member.discordSyncPending) && member.discordSyncPendingAt && member.discordSyncPendingAt <= staleAt;
          if (filter === 'suspended') return member.status === 'suspended';
          return member.isInDiscordGuild === false && member.discordLeftAt && member.discordLeftAt > graceAfter;
        }).slice((page - 1) * limit, page * limit);
    const total = db ? await db.collection(collectionNames.members).countDocuments(baseQuery) : documents.length;
    response.json({ items: documents.map(publicMember), filter, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    response.status(503).json({ error: 'Synchronization health is temporarily unavailable.' });
  }
});

app.get('/api/guild-profile', async (request, response) => {
  const session = requirePermission(request, response, 'member.read');
  if (!session) return;
  try {
    const settingsDb = await getDatabase();
    const savedSettings = settingsDb
      ? await settingsDb.collection(collectionNames.settings).findOne({ id: 'guild' })
      : getLocalDocuments(collectionNames.settings).find((item) => item.id === 'guild');
    let uid = savedSettings?.guildOwnerUid || session.freeFireUid || session.application?.gameId || '';
    let region = session.application?.region || process.env.HLGAMING_REGION || 'ind';
    if (!uid) {
      const savedMember = settingsDb
        ? await settingsDb.collection(collectionNames.members).findOne({ id: session.id })
        : getLocalDocuments(collectionNames.members).find((item) => item.id === session.id);
      uid = savedMember?.freeFireUid || savedMember?.application?.gameId || '';
      region = savedMember?.application?.region || region;
    }
    if (!uid) return response.status(400).json({ error: 'Link a Free Fire UID before loading guild details.' });
    const profile = await getCachedGuildProfile(uid, region);
    const ownerMember = settingsDb
      ? await settingsDb.collection(collectionNames.members).findOne({ $or: [{ freeFireUid: uid }, { isOwner: true }, { role: 'admin' }] })
      : getLocalDocuments(collectionNames.members).find((item) => item.freeFireUid === uid || item.isOwner === true || item.role === 'admin');
    let ownerStats = ownerMember?.stats || null;
    const statsRefreshAt = Date.parse(ownerMember?.lastFreeFireStatsRefreshAt || '');
    if (!statsRefreshAt || Date.now() - statsRefreshAt >= guildProfileRefreshMs) {
      try {
        ownerStats = await fetchFreeFireStats(uid, region, hlGamingApiKey);
        const statsChanges = { freeFireUid: uid, stats: ownerStats, lastFreeFireStatsRefreshAt: new Date().toISOString() };
        if (settingsDb && ownerMember) await settingsDb.collection(collectionNames.members).updateOne({ id: ownerMember.id }, { $set: statsChanges });
        else if (ownerMember) updateLocalDocument(collectionNames.members, ownerMember.id, statsChanges);
      } catch (statsError) {
        console.warn(`Guild owner stats refresh failed: ${statsError.message}`);
      }
    }
    response.json({ ...profile, ownerMemberId: ownerMember?.id || null, ownerStats });
  } catch (error) {
    response.status(502).json({ error: error.message });
  }
});

app.post('/api/guild-profile/refresh', async (request, response) => {
  const session = requirePermission(request, response, 'settings.manage');
  if (!session) return;
  try {
    const db = await getDatabase();
    const settings = db
      ? await db.collection(collectionNames.settings).findOne({ id: 'guild' })
      : getLocalDocuments(collectionNames.settings).find((item) => item.id === 'guild');
    const uid = settings?.guildOwnerUid;
    const region = process.env.HLGAMING_REGION || 'ind';
    if (!uid) return response.status(400).json({ error: 'Set the Guild Owner Free Fire UID before refreshing.' });
    const membersCollection = db?.collection(collectionNames.members);
    const localMembers = getLocalDocuments(collectionNames.members);
    const ownerMember = db
      ? await membersCollection.findOne({ freeFireUid: uid }) || await membersCollection.findOne({ isOwner: true }) || await membersCollection.findOne({ role: 'admin' })
      : localMembers.find((member) => member.freeFireUid === uid) || localMembers.find((member) => member.isOwner === true) || localMembers.find((member) => member.role === 'admin');
    const cachedProfile = db
      ? await db.collection(guildProfileCollection).findOne({ id: 'guild' })
      : getLocalDocuments(guildProfileCollection).find((item) => item.id === 'guild');
    const cachedOwnerStats = ownerMember?.stats || null;
    let guildProfile = cachedProfile;
    let ownerStats = null;
    const refreshErrors = [];
    try {
      guildProfile = await fetchGuildProfile(uid, region, hlGamingApiKey);
    } catch (error) {
      refreshErrors.push(`Guild profile: ${error.message}`);
    }
    try {
      ownerStats = await fetchFreeFireStats(uid, region, hlGamingApiKey);
    } catch (error) {
      refreshErrors.push(`Leader stats: ${error.message}`);
    }
    if (!guildProfile && !ownerStats) return response.status(502).json({ error: refreshErrors.join(' ') || 'Guild data is not available yet.' });
    const ownerRecord = ownerStats ? { id: ownerMember?.id || 'guild-owner', memberId: ownerMember?.id || 'guild-owner', ...ownerStats, region } : null;
    if (db) {
      if (guildProfile && guildProfile !== cachedProfile) await db.collection(guildProfileCollection).replaceOne({ id: 'guild' }, guildProfile, { upsert: true });
      if (ownerRecord) {
        await db.collection(freeFireStatsCollection).replaceOne({ id: ownerRecord.id }, ownerRecord, { upsert: true });
        if (ownerMember) await membersCollection.updateOne({ id: ownerMember.id }, { $set: { freeFireUid: uid, stats: ownerStats, lastFreeFireStatsRefreshAt: new Date().toISOString() } });
      }
    } else {
      if (guildProfile && guildProfile !== cachedProfile) saveLocalDocument(guildProfileCollection, guildProfile);
      if (ownerRecord) {
        saveLocalDocument(freeFireStatsCollection, ownerRecord);
        if (ownerMember) updateLocalDocument(collectionNames.members, ownerMember.id, { freeFireUid: uid, stats: ownerStats, lastFreeFireStatsRefreshAt: new Date().toISOString() });
      }
    }
    response.json({ guildProfile, ownerStats: ownerStats || cachedOwnerStats, ownerMemberId: ownerMember?.id || null, refreshErrors });
  } catch (error) {
    response.status(502).json({ error: error.message });
  }
});

app.get('/api/members/:id/profile', async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  try {
    const db = await getDatabase();
    const memberDocument = db
      ? await db.collection(collectionNames.members).findOne({ id: request.params.id })
      : getLocalDocuments(collectionNames.members).find((member) => member.id === request.params.id);
    if (!memberDocument) return response.status(404).json({ error: 'Member profile not found.' });
    if (!canViewMemberProfile(memberDocument, session)) {
      return response.status(403).json({ error: 'This profile is not available to you.' });
    }
    const rankingSummary = await getMemberRankingSummary(memberDocument.id);
    const profile = buildMemberProfileView(memberDocument, session);
    if (profile) {
      profile.ranking = {
        points: rankingSummary.points,
        rankTitle: rankingSummary.rankTitle,
        position: rankingSummary.position,
      };
      profile.rank = rankingSummary.rankTitle;
      profile.achievements = Array.from(new Set([...(memberDocument.achievements || []), ...rankingSummary.achievements]));
    }
    response.json(profile || { error: 'This profile is not available to you.' });
  } catch (error) {
    response.status(502).json({ error: 'Member profile is temporarily unavailable.' });
  }
});

app.get('/api/ranking/leaderboard', async (request, response) => {
  const session = requirePermission(request, response, 'member.read');
  if (!session) return;
  try {
    const entries = await getLeaderboardEntries();
    response.json({
      generatedAt: new Date().toISOString(),
      entries,
      totalMembers: entries.length,
    });
  } catch (error) {
    response.status(502).json({ error: 'Leaderboard data is temporarily unavailable.' });
  }
});

function normalizeProfileUpdatePayload(rawValue, memberId, viewer) {
  const candidate = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
  const allowedFields = new Set(['bio', 'freeFireName', 'freeFireUid', 'preferredRegion', 'preferredPlaystyle', 'profileVisibility']);
  const unknownFields = Object.keys(candidate).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    throw new Error(`Unknown profile fields: ${unknownFields.join(', ')}`);
  }
  const updates = {};
  if (Object.prototype.hasOwnProperty.call(candidate, 'bio')) {
    const bio = String(candidate.bio || '').trim();
    if (bio.length > 500) throw new Error('Bio must be 500 characters or fewer.');
    updates.bio = bio;
  }
  if (Object.prototype.hasOwnProperty.call(candidate, 'freeFireName')) {
    const value = String(candidate.freeFireName ?? '').trim();
    if (value.length > 40) throw new Error('Free Fire name must be 40 characters or fewer.');
    if (value && !/^[\p{L}\p{N}\s._-]{1,40}$/u.test(value)) throw new Error('Free Fire name contains unsupported characters.');
    updates.freeFireName = value;
  }
  if (Object.prototype.hasOwnProperty.call(candidate, 'freeFireUid')) {
    const value = String(candidate.freeFireUid ?? '').trim();
    if (value && !/^\d{5,15}$/.test(value)) throw new Error('Free Fire UID must be 5 to 15 digits.');
    updates.freeFireUid = value;
  }
  if (Object.prototype.hasOwnProperty.call(candidate, 'preferredRegion')) {
    const value = String(candidate.preferredRegion ?? '').trim();
    if (value.length > 24) throw new Error('Preferred region must be 24 characters or fewer.');
    updates.preferredRegion = value;
  }
  if (Object.prototype.hasOwnProperty.call(candidate, 'preferredPlaystyle')) {
    const value = String(candidate.preferredPlaystyle ?? '').trim();
    if (value.length > 40) throw new Error('Preferred playstyle must be 40 characters or fewer.');
    if (value && !/^[\p{L}\p{N}\s._-]{1,40}$/u.test(value)) throw new Error('Preferred playstyle contains unsupported characters.');
    updates.preferredPlaystyle = value;
  }
  if (Object.prototype.hasOwnProperty.call(candidate, 'profileVisibility')) {
    const value = String(candidate.profileVisibility ?? '').trim();
    if (!['public', 'guild', 'private'].includes(value)) throw new Error('Profile visibility must be public, guild, or private.');
    updates.profileVisibility = value;
  }
  if (Object.keys(updates).length === 0) throw new Error('No valid profile fields were provided.');
  return updates;
}

app.patch('/api/members/:id/profile', async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const targetId = String(request.params.id || '');
  if (!targetId) return response.status(400).json({ error: 'A member id is required.' });
  if (targetId !== session.id && !hasPermission(session, 'member.manage')) {
    securityLog('member_profile_patch_denied', request, { memberId: session.id, targetId, reason: 'not_self_or_staff', source: 'security' });
    return response.status(403).json({ error: 'You can only update your own profile unless you have staff access.' });
  }
  if (!checkProfileMutationRateLimit(session.id, request)) {
    return response.status(429).json({ error: 'Profile updates are rate limited. Please wait a moment and try again.' });
  }
  try {
    const db = await getDatabase();
    const existingMember = db
      ? await db.collection(collectionNames.members).findOne({ id: targetId })
      : getLocalDocuments(collectionNames.members).find((member) => member.id === targetId);
    if (!existingMember) return response.status(404).json({ error: 'Member not found.' });
    if (existingMember.status === 'suspended' && targetId !== session.id && !hasPermission(session, 'member.manage')) {
      return response.status(403).json({ error: 'Suspended members cannot access this profile.' });
    }
    const updates = normalizeProfileUpdatePayload(request.body, targetId, session);
    const changedFields = Object.keys(updates);
    if (existingMember.status === 'suspended' && targetId === session.id) {
      securityLog('suspended_profile_update_denied', request, { memberId: session.id, targetId, reason: 'suspended', source: 'security' });
      return response.status(403).json({ error: 'Suspended accounts cannot update their profile.' });
    }
    const nextDocument = { ...existingMember, ...updates };
    if (db) await db.collection(collectionNames.members).updateOne({ id: targetId }, { $set: updates });
    else updateLocalDocument(collectionNames.members, targetId, updates);
    const refreshedMember = { ...nextDocument, ...updates };
    updateActiveMemberSessions(targetId, updates);
    void recordAuditEvent({
      eventType: 'profile_updated',
      action: 'profile_updated',
      source: targetId === session.id ? 'member' : 'admin',
      request,
      actor: session,
      target: existingMember,
      previousValue: { fields: changedFields },
      newValue: { fields: changedFields },
      reason: targetId === session.id ? 'Self profile update' : 'Staff profile modification',
      metadata: { changedFields },
    });
    response.json(publicMember(refreshedMember));
  } catch (error) {
    securityLog('profile_update_failed', request, { memberId: session.id, targetId, reason: error.message, source: 'security', success: false });
    void recordAuditEvent({
      eventType: 'profile_update_failed',
      action: 'profile_update_failed',
      source: 'member',
      request,
      actor: session,
      target: { id: targetId },
      success: false,
      reason: error.message,
      metadata: { targetId },
    });
    response.status(400).json({ error: error.message });
  }
});

app.get('/api/:resource', async (request, response) => {
  if (request.params.resource === 'tournament-participants') return response.status(404).json({ error: 'Use the tournament participant endpoints.' });
  const collectionName = collectionNames[request.params.resource];
  if (!collectionName) return response.status(404).json({ error: 'Unknown resource' });
  if (request.params.resource === 'tournaments') {
    const session = requirePermission(request, response, 'member.read');
    if (!session) return;
    const eventId = typeof request.query.eventId === 'string' ? request.query.eventId.trim() : '';
    try {
      const tournaments = await listTournamentDocuments(eventId);
      return response.json(tournaments.map(publicTournament));
    } catch (error) {
      return response.status(503).json({ error: `Tournament data is temporarily unavailable: ${error.message}` });
    }
  }
  let rosterSession = null;
  if (request.params.resource === 'members') {
    rosterSession = requireSession(request, response);
    if (!rosterSession) return;
  }
  if (isRankingResource(request.params.resource)) {
    const session = requirePermission(request, response, 'member.read');
    if (!session) return;
  }
  try {
    const db = await getResourceDatabase(request.params.resource);
    if (!db) {
      const localMembers = getLocalDocuments(collectionName);
      if (request.params.resource !== 'members') return response.json(localMembers);
      const visibleMembers = hasPermission(rosterSession, 'member.manage') ? localMembers : localMembers.filter((member) => member.status === 'approved');
      return response.json(hasPermission(rosterSession, 'member.manage')
        ? await Promise.all(visibleMembers.map(publicMemberWithKey))
        : visibleMembers.map(publicRosterMember));
    }
    const documents = await db.collection(collectionName).find({}).toArray();
    if (request.params.resource !== 'members') return response.json(documents);
    const visibleMembers = hasPermission(rosterSession, 'member.manage') ? documents : documents.filter((member) => member.status === 'approved');
    response.json(hasPermission(rosterSession, 'member.manage')
      ? await Promise.all(visibleMembers.map(publicMemberWithKey))
      : visibleMembers.map(publicRosterMember));
  } catch (error) {
    console.warn(`MongoDB read unavailable, using local data: ${error.message}`);
    const localMembers = getLocalDocuments(collectionName);
    if (request.params.resource !== 'members') return response.json(localMembers);
    const visibleMembers = hasPermission(rosterSession, 'member.manage') ? localMembers : localMembers.filter((member) => member.status === 'approved');
    response.json(hasPermission(rosterSession, 'member.manage') ? visibleMembers : visibleMembers.map(publicRosterMember));
  }
});

async function getEventDocument(eventId) {
  const db = await getDatabase();
  return db
    ? await db.collection(collectionNames.events).findOne({ id: eventId })
    : getLocalDocuments(collectionNames.events).find((item) => item.id === eventId) || null;
}

async function persistEventDocument(event) {
  const db = await getDatabase();
  if (db) {
    await db.collection(collectionNames.events).replaceOne({ id: event.id }, event, { upsert: true });
    return event;
  }
  saveLocalDocument(collectionNames.events, event);
  return event;
}

app.post('/api/events/:id/register', async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const member = await findMemberById(session.id);
  if (!member) return response.status(404).json({ error: 'Member not found.' });
  if (member.status !== 'approved') return response.status(403).json({ error: 'Only approved members can register for events.' });

  const event = await getEventDocument(request.params.id);
  if (!event) return response.status(404).json({ error: 'Event not found.' });
  if (event.status === 'cancelled' || event.status === 'completed') return response.status(409).json({ error: 'This event is no longer accepting registrations.' });
  const participants = Array.isArray(event.participants) ? event.participants : [];
  if (participants.includes(member.id)) return response.status(409).json({ error: 'You are already registered for this event.' });
  if (participants.length >= Number(event.participantLimit || 0)) return response.status(409).json({ error: 'This event is full.' });

  const nextEvent = {
    ...event,
    participants: [...participants, member.id],
    updatedAt: new Date().toISOString(),
    registrationOpen: true,
  };

  await persistEventDocument(nextEvent);
  void recordAuditEvent({
    eventType: 'event_registration',
    action: 'event_registration',
    source: 'member',
    request,
    actor: session,
    target: { id: event.id, displayName: event.name },
    previousValue: { participants: participants.length },
    newValue: { participants: nextEvent.participants.length },
    reason: 'Member registered for guild event',
  });
  response.json(nextEvent);
});

app.post('/api/events/:id/leave', async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const event = await getEventDocument(request.params.id);
  if (!event) return response.status(404).json({ error: 'Event not found.' });
  const participants = Array.isArray(event.participants) ? event.participants : [];
  if (!participants.includes(session.id)) return response.status(409).json({ error: 'You are not registered for this event.' });
  if (event.status === 'cancelled' || event.status === 'completed') return response.status(409).json({ error: 'This event cannot be modified after completion.' });

  const nextEvent = {
    ...event,
    participants: participants.filter((id) => id !== session.id),
    updatedAt: new Date().toISOString(),
  };

  await persistEventDocument(nextEvent);
  void recordAuditEvent({
    eventType: 'event_unregistered',
    action: 'event_unregistered',
    source: 'member',
    request,
    actor: session,
    target: { id: event.id, displayName: event.name },
    previousValue: { participants: participants.length },
    newValue: { participants: nextEvent.participants.length },
    reason: 'Member left guild event',
  });
  response.json(nextEvent);
});

app.post('/api/events/:id/result', async (request, response) => {
  const session = requirePermission(request, response, 'member.manage');
  if (!session) return;
  const event = await getEventDocument(request.params.id);
  if (!event) return response.status(404).json({ error: 'Event not found.' });
  const winnerId = typeof request.body?.winnerId === 'string' ? request.body.winnerId.trim() : '';
  const summary = typeof request.body?.summary === 'string' ? request.body.summary.trim().slice(0, 500) : '';
  if (!winnerId && !summary) return response.status(400).json({ error: 'Provide a winner member id or result summary.' });
  if (winnerId && !Array.isArray(event.participants)) return response.status(400).json({ error: 'This event does not have any valid participants.' });
  if (winnerId && !event.participants.includes(winnerId)) return response.status(400).json({ error: 'The winner must be a registered participant.' });

  const nextEvent = {
    ...event,
    status: 'completed',
    result: {
      ...(event.result || {}),
      winnerId: winnerId || event.result?.winnerId,
      summary: summary || event.result?.summary || '',
      verifiedBy: session.id,
      verifiedAt: new Date().toISOString(),
    },
    tournament: {
      ...(event.tournament || {}),
      championId: winnerId || event.tournament?.championId,
      winnerId: winnerId || event.tournament?.winnerId,
      verified: true,
    },
    updatedAt: new Date().toISOString(),
  };

  await persistEventDocument(nextEvent);
  void recordAuditEvent({
    eventType: 'event_result_verified',
    action: 'event_result_verified',
    source: 'admin',
    request,
    actor: session,
    target: { id: event.id, displayName: event.name },
    previousValue: { result: event.result || null, status: event.status },
    newValue: { result: nextEvent.result, status: nextEvent.status },
    reason: 'Staff verified event result',
  });
  response.json(nextEvent);
});

app.post('/api/members/:id/free-fire-stats', async (request, response) => {
  const session = requirePermission(request, response, 'member.read');
  if (!session) return;
  if (request.params.id !== session.id && !hasPermission(session, 'member.manage')) return response.status(403).json({ error: 'Only the member or guild staff can refresh Free Fire stats.' });
  const uid = String(request.body?.uid || session.freeFireUid || '').trim();
  const region = String(request.body?.region || hlGamingRegion).trim().toLowerCase();
  if (!/^\d{5,15}$/.test(uid)) return response.status(400).json({ error: 'A valid Free Fire UID is required.' });
  try {
    const memberDocument = await getDatabase().then((db) => db?.collection(collectionNames.members).findOne({ id: request.params.id })).catch(() => null)
      || getLocalDocuments(collectionNames.members).find((item) => item.id === request.params.id);
    const storedKey = await getStoredHlGamingKey(request.params.id);
    const memberApiKey = decryptApiKey(storedKey?.apiKeyEncrypted) || decryptApiKey(memberDocument?.hlGamingApiKeyEncrypted) || hlGamingMemberApiKeys[0] || hlGamingApiKey;
    const stats = await saveFreeFireStats(request.params.id, uid, region, memberApiKey);
    const db = await getDatabase();
    const changes = { freeFireUid: uid, stats, lastFreeFireStatsRefreshAt: new Date().toISOString() };
    if (db) await db.collection(collectionNames.members).updateOne({ id: request.params.id }, { $set: changes });
    else updateLocalDocument(collectionNames.members, request.params.id, changes);
    response.json({ freeFireUid: uid, stats });
  } catch (error) {
    response.status(502).json({ error: error.message });
  }
});

app.post('/api/members/:id/hl-gaming-key', async (request, response) => {
  const session = requirePermission(request, response, 'member.read');
  if (!session) return;
  if (request.params.id !== session.id && !hasPermission(session, 'member.manage')) return response.status(403).json({ error: 'You can only manage your own HL Gaming API key.' });
  const apiKey = String(request.body?.apiKey || '').trim();
  if (apiKey.length < 8) return response.status(400).json({ error: 'Enter a valid HL Gaming API key.' });
  const member = await getDatabase().then((db) => db?.collection(collectionNames.members).findOne({ id: request.params.id })).catch(() => null)
    || getLocalDocuments(collectionNames.members).find((item) => item.id === request.params.id);
  const uid = String(member?.freeFireUid || member?.application?.gameId || '').trim();
  if (!/^\d{5,15}$/.test(uid)) return response.status(400).json({ error: 'Add a Free Fire UID before saving an HL Gaming API key.' });
  try {
    await validateHlGamingApiKey(apiKey, uid, String(member?.application?.region || hlGamingRegion).toLowerCase());
    const rankingDb = await getRankingDatabase();
    if (!rankingDb) return response.status(503).json({ error: 'Ranking database is unavailable. The key was not stored.' });
    const timestamp = new Date().toISOString();
    await rankingDb.collection(hlGamingKeysCollection).replaceOne(
      { memberId: request.params.id },
      { memberId: request.params.id, uid, apiKeyEncrypted: encryptApiKey(apiKey), createdAt: timestamp, lastValidatedAt: timestamp, lastUsedAt: timestamp },
      { upsert: true },
    );
    response.json({ saved: true, hasHlGamingApiKey: true });
  } catch (error) {
    await getRankingDatabase().then((db) => db?.collection(hlGamingKeysCollection).deleteOne({ memberId: request.params.id })).catch(() => undefined);
    response.status(400).json({ error: error.message });
  }
});

app.get('/api/admin/hl-gaming-keys', async (request, response) => {
  if (!requirePermission(request, response, 'settings.manage')) return;
  const rankingDb = await getRankingDatabase();
  const primaryDb = await getDatabase();
  const [keys, config] = await Promise.all([
    rankingDb ? rankingDb.collection(hlGamingKeysCollection).find({}).project({ _id: 0, apiKeyEncrypted: 0 }).toArray() : [],
    getHlGamingConfig(),
  ]);
  const members = primaryDb ? await primaryDb.collection(collectionNames.members).find({}).project({ _id: 0, id: 1, displayName: 1, role: 1, freeFireUid: 1 }).toArray() : getLocalDocuments(collectionNames.members);
  const memberById = new Map(members.map((member) => [member.id, member]));
  const personalKeys = keys.map((key) => ({
    ...key,
    memberName: memberById.get(key.memberId)?.displayName || key.memberId,
    role: memberById.get(key.memberId)?.role || 'other',
    keyStatus: key.lastUsedAt ? 'active' : 'validated',
  }));
  response.json({
    config: { maxMemberRefreshesPerKey: config.maxMemberRefreshesPerKey, roleSettings: config.roleSettings, automationSettings: config.automationSettings },
    roleKeys: publicRoleKeys(config),
    categories: {
      guildLeader: { configured: Boolean(hlGamingApiKey), key: maskApiKey(hlGamingApiKey), source: 'HLGAMING_API_KEY' },
      sharedRoles: [
        { role: 'coadmin', label: 'Acting Leader', configured: Boolean(hlGamingMemberApiKeys[0]), key: maskApiKey(hlGamingMemberApiKeys[0]), source: 'HLGAMING_MEMBER_API_KEY_1' },
        { role: 'moderator', label: 'Elder', configured: Boolean(hlGamingMemberApiKeys[1]), key: maskApiKey(hlGamingMemberApiKeys[1]), source: 'HLGAMING_MEMBER_API_KEY_2' },
      ],
      personalByRole: {
        admin: personalKeys.filter((key) => key.role === 'admin'),
        coadmin: personalKeys.filter((key) => key.role === 'coadmin'),
        moderator: personalKeys.filter((key) => key.role === 'moderator'),
        member: personalKeys.filter((key) => key.role === 'member'),
        other: personalKeys.filter((key) => !['admin', 'coadmin', 'moderator', 'member'].includes(key.role)),
      },
    },
    keys: personalKeys,
  });
});

app.post('/api/admin/hl-gaming-role-key', async (request, response) => {
  if (!requirePermission(request, response, 'settings.manage')) return;
  const role = String(request.body?.role || '');
  const apiKey = String(request.body?.apiKey || '').trim();
  if (!Object.prototype.hasOwnProperty.call(defaultRoleKeySettings, role)) return response.status(400).json({ error: 'Select a valid guild role.' });
  if (apiKey.length < 8) return response.status(400).json({ error: 'Enter a valid HL Gaming API key.' });
  const rankingDb = await getRankingDatabase();
  if (!rankingDb) return response.status(503).json({ error: 'Ranking database is unavailable. The key was not stored.' });
  const current = await rankingDb.collection(hlGamingConfigCollection).findOne({ id: 'settings' });
  const roleApiKeys = { ...(current?.roleApiKeys || {}), [role]: encryptApiKey(apiKey) };
  await rankingDb.collection(hlGamingConfigCollection).updateOne({ id: 'settings' }, { $set: { roleApiKeys, updatedAt: new Date().toISOString() }, $setOnInsert: { maxMemberRefreshesPerKey } }, { upsert: true });
  response.json({ role, key: { configured: true, key: maskApiKey(apiKey), source: 'Website-managed encrypted key' } });
});

app.delete('/api/admin/hl-gaming-role-key/:role', async (request, response) => {
  if (!requirePermission(request, response, 'settings.manage')) return;
  if (!Object.prototype.hasOwnProperty.call(defaultRoleKeySettings, request.params.role)) return response.status(400).json({ error: 'Select a valid guild role.' });
  const rankingDb = await getRankingDatabase();
  if (!rankingDb) return response.status(503).json({ error: 'Ranking database is unavailable.' });
  await rankingDb.collection(hlGamingConfigCollection).updateOne({ id: 'settings' }, { $unset: { [`roleApiKeys.${request.params.role}`]: '' }, $set: { updatedAt: new Date().toISOString() } });
  response.status(204).end();
});

app.patch('/api/admin/hl-gaming-config', async (request, response) => {
  if (!requirePermission(request, response, 'settings.manage')) return;
  const value = Number(request.body?.maxMemberRefreshesPerKey);
  if (!Number.isInteger(value) || value < 1 || value > 10000) return response.status(400).json({ error: 'The shared refresh maximum must be an integer from 1 to 10000.' });
  const roleSettings = request.body?.roleSettings;
  const automationSettings = request.body?.automationSettings;
  if (roleSettings && typeof roleSettings !== 'object') return response.status(400).json({ error: 'Role settings must be an object.' });
  if (automationSettings && typeof automationSettings !== 'object') return response.status(400).json({ error: 'Automation settings must be an object.' });
  const rankingDb = await getRankingDatabase();
  if (!rankingDb) return response.status(503).json({ error: 'Ranking database is unavailable.' });
  const current = await getHlGamingConfig();
  const nextRoleSettings = Object.fromEntries(Object.entries(defaultRoleKeySettings).map(([role, defaults]) => [role, { ...defaults, ...current.roleSettings[role], ...(roleSettings?.[role] || {}) }]));
  const nextAutomationSettings = Object.fromEntries(Object.entries(defaultAutomationSettings).map(([role, defaults]) => [role, { ...defaults, ...current.automationSettings[role], ...(automationSettings?.[role] || {}), notifications: { ...defaults.notifications, ...current.automationSettings[role]?.notifications, ...automationSettings?.[role]?.notifications } }]));
  for (const settings of Object.values(nextRoleSettings)) {
    if (!Number.isInteger(Number(settings.refreshEveryDays)) || Number(settings.refreshEveryDays) < 1 || Number(settings.refreshEveryDays) > 365) return response.status(400).json({ error: 'Refresh days must be an integer from 1 to 365.' });
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.refreshTime)) return response.status(400).json({ error: 'Refresh time must use HH:MM format.' });
    if (!['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(settings.refreshDay)) return response.status(400).json({ error: 'Refresh day is invalid.' });
    if (!Number.isInteger(Number(settings.shareMemberCount)) || Number(settings.shareMemberCount) < 1 || Number(settings.shareMemberCount) > 100) return response.status(400).json({ error: 'Shared member count must be an integer from 1 to 100.' });
  }
  await rankingDb.collection(hlGamingConfigCollection).replaceOne({ id: 'settings' }, { id: 'settings', maxMemberRefreshesPerKey: value, roleSettings: nextRoleSettings, automationSettings: nextAutomationSettings, roleApiKeys: current.roleApiKeys || {}, updatedAt: new Date().toISOString() }, { upsert: true });
  response.json({ maxMemberRefreshesPerKey: value, roleSettings: nextRoleSettings, automationSettings: nextAutomationSettings });
});

app.delete('/api/admin/hl-gaming-keys/:memberId', async (request, response) => {
  if (!requirePermission(request, response, 'settings.manage')) return;
  const rankingDb = await getRankingDatabase();
  if (!rankingDb) return response.status(503).json({ error: 'Ranking database is unavailable.' });
  await rankingDb.collection(hlGamingKeysCollection).deleteOne({ memberId: request.params.memberId });
  response.status(204).end();
});

app.post('/api/admin/hl-gaming-key-reminder/:memberId', async (request, response) => {
  const session = requirePermission(request, response, 'settings.manage');
  if (!session) return;
  const db = await getDatabase();
  const target = await db?.collection(collectionNames.members).findOne({ id: request.params.memberId })
    || getLocalDocuments(collectionNames.members).find((item) => item.id === request.params.memberId);
  if (!target) return response.status(404).json({ error: 'Member not found.' });
  const storedKey = await getStoredHlGamingKey(target.id);
  if (storedKey?.apiKeyEncrypted) return response.status(409).json({ error: 'This member already has an API key.' });
  const reminder = 'Please add your HL Gaming API key in your website profile settings so your Free Fire data can refresh on schedule.';
  const notifications = request.body?.notifications || { discord: true, website: false, device: true };
  let discordSent = false;
  let discordError = '';
  if (notifications.discord !== false && discordBot && target.discordId) {
    const guild = discordBot.guilds.cache.get(discordGuildId) || await discordBot.guilds.fetch(discordGuildId).catch(() => null);
    const guildMember = guild ? await guild.members.fetch(target.discordId).catch(() => null) : null;
    const discordUser = guildMember?.user || await discordBot.users.fetch(target.discordId).catch(() => null);
    if (!discordUser) discordError = 'Discord user could not be found.';
    else discordSent = await discordUser.send(reminder).then(() => true).catch((error) => { discordError = error.message; return false; });
  } else if (notifications.discord !== false) {
    discordError = !discordBot ? 'Discord bot is offline.' : 'Member has no Discord account ID.';
  }
  const chatMessage = {
    id: `chat-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    authorId: session.id,
    authorName: session.displayName,
    authorRole: session.role,
    channel: 'dm',
    recipientId: target.id,
    seenBy: [],
    content: reminder,
    createdAt: new Date().toISOString(),
  };
  const websiteSent = notifications.website === true;
  if (websiteSent) {
    chatMessages.push(chatMessage);
    if (chatMessages.length > 100) chatMessages.shift();
    void persistChatMessage(chatMessage);
    sendChatMessageToParticipants(chatMessage);
  }
  const deviceSent = notifications.device === true ? sendDeviceReminderToMember(target.id, reminder) : false;
  response.json({ discordSent, websiteSent, deviceSent, discordError: discordSent || notifications.discord === false ? '' : discordError });
});

app.post('/api/admin/reconcile-member/:id', async (request, response) => {
  const session = requirePermission(request, response, 'settings.manage');
  if (!session) return;
  const db = await getDatabase();
  const member = db
    ? await db.collection(collectionNames.members).findOne({ id: request.params.id })
    : getLocalDocuments(collectionNames.members).find((item) => item.id === request.params.id);
  if (!member) return response.status(404).json({ error: 'Member not found.' });
  try {
    const reconciled = await reconcileMember(member.discordId, { forceDepartureCleanup: true });
    response.json({ member: publicMember(reconciled), reconciled: true });
  } catch (error) {
    lastSyncFailureAt = new Date().toISOString();
    void recordAuditEvent({ eventType: 'reconciliation_failed', action: 'reconciliation_failed', source: 'admin', request, actor: session, target: member, success: false, reason: error.message });
    console.error(`[sync] Manual reconciliation failed for ${member.discordId}: ${error.message}`);
    response.status(502).json({ error: `Member reconciliation failed: ${error.message}` });
  }
});

app.post('/api/admin/reconcile-all', async (request, response) => {
  const session = requirePermission(request, response, 'settings.manage');
  if (!session) return;
  const db = await getDatabase();
  const members = db
    ? await db.collection(collectionNames.members).find({ discordId: { $exists: true, $ne: '' } }).project({ discordId: 1 }).toArray()
    : getLocalDocuments(collectionNames.members).filter((member) => member.discordId).map((member) => ({ discordId: member.discordId }));
  const results = await Promise.allSettled(members.map((member) => reconcileMember(member.discordId, { forceDepartureCleanup: true })));
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed > 0) console.error(`[sync] Manual all-member reconciliation completed with ${failed} failure(s).`);
  response.json({ total: results.length, reconciled: results.length - failed, failed });
});

function escapeAuditRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function auditQueryFromRequest(request) {
  const rawPage = Number.parseInt(String(request.query.page || '1'), 10);
  const rawLimit = Number.parseInt(String(request.query.limit || '50'), 10);
  const page = Number.isInteger(rawPage) ? Math.min(Math.max(rawPage, 1), 100000) : 1;
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
  const query = {};
  const exactFilters = ['eventType', 'source'];
  for (const field of exactFilters) {
    const value = typeof request.query[field] === 'string' ? request.query[field].trim() : '';
    if (value) {
      if (!/^[a-zA-Z0-9_.:-]{1,120}$/.test(value)) throw new Error(`Invalid audit ${field} filter.`);
      query[field] = value;
    }
  }
  const category = typeof request.query.category === 'string' ? request.query.category : '';
  const categoryPrefixes = {
    member: ['member_'],
    role: ['role_', 'website_role_', 'discord_role_'],
    suspension: ['member_suspended', 'member_unsuspended', 'suspended_'],
    discord: ['discord_', 'reconciliation', 'onboarding_'],
    security: ['unauthorized_', 'forbidden_', 'origin_', 'suspension_', 'protected_', 'member_patch_denied'],
    authentication: ['authentication_', 'invalid_oauth_', 'logout'],
  };
  if (category) {
    if (!categoryPrefixes[category]) throw new Error('Invalid audit category filter.');
    query.eventType = { $regex: `^(?:${categoryPrefixes[category].map(escapeAuditRegex).join('|')})` };
  }
  const actor = typeof request.query.actor === 'string' ? request.query.actor.trim().slice(0, 120) : '';
  const target = typeof request.query.target === 'string' ? request.query.target.trim().slice(0, 120) : '';
  if (actor) query.$or = [{ actorId: { $regex: escapeAuditRegex(actor), $options: 'i' } }, { actorDiscordId: { $regex: escapeAuditRegex(actor), $options: 'i' } }, { actorName: { $regex: escapeAuditRegex(actor), $options: 'i' } }];
  if (target) query.$and = [{ $or: [{ targetId: { $regex: escapeAuditRegex(target), $options: 'i' } }, { targetDiscordId: { $regex: escapeAuditRegex(target), $options: 'i' } }, { targetName: { $regex: escapeAuditRegex(target), $options: 'i' } }] }];
  if (request.query.success !== undefined) {
    if (request.query.success !== 'true' && request.query.success !== 'false') throw new Error('Invalid audit success filter.');
    query.success = request.query.success === 'true';
  }
  const from = typeof request.query.from === 'string' ? new Date(request.query.from) : null;
  const to = typeof request.query.to === 'string' ? new Date(request.query.to) : null;
  if (from && Number.isNaN(from.getTime())) throw new Error('Invalid audit start date.');
  if (to && Number.isNaN(to.getTime())) throw new Error('Invalid audit end date.');
  if (from && to && from > to) throw new Error('Audit start date must be before end date.');
  if (from || to) query.timestamp = { ...(from ? { $gte: from.toISOString() } : {}), ...(to ? { $lte: to.toISOString() } : {}) };
  return { query, page, limit };
}

function localAuditMatches(event, query) {
  if (query.success !== undefined && event.success !== query.success) return false;
  for (const field of ['eventType', 'source']) {
    if (typeof query[field] === 'string' && event[field] !== query[field]) return false;
  }
  if (query.eventType?.$regex && !new RegExp(query.eventType.$regex).test(event.eventType || '')) return false;
  if (query.timestamp) {
    if (query.timestamp.$gte && event.timestamp < query.timestamp.$gte) return false;
    if (query.timestamp.$lte && event.timestamp > query.timestamp.$lte) return false;
  }
  const matchesSearch = (fields, searchQuery) => !searchQuery || fields.some((field) => String(event[field] || '').toLowerCase().includes(searchQuery.toLowerCase()));
  const actorSearch = query.$or?.[0]?.actorId?.$regex;
  const targetSearch = query.$and?.[0]?.$or?.[0]?.targetId?.$regex;
  return matchesSearch(['actorId', 'actorDiscordId', 'actorName'], actorSearch?.replace(/\\/g, '')) && matchesSearch(['targetId', 'targetDiscordId', 'targetName'], targetSearch?.replace(/\\/g, ''));
}

function publicTournament(tournament) {
  if (!tournament) return tournament;
  const { _id, ...safeTournament } = tournament;
  return safeTournament;
}

function normalizeTournamentDate(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${fieldName} is required.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${fieldName} must be a valid date.`);
  return date.toISOString();
}

function validateTournamentRules(value, fieldName, { partial = false } = {}) {
  if (value === undefined && partial) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${fieldName} must be an object.`);
  const allowedFields = fieldName === 'scoringRules' ? new Set(['placementPoints', 'killPoints']) : new Set(['enabled', 'verifiedOnly', 'taskId']);
  if (Object.keys(value).some((field) => !allowedFields.has(field))) throw new Error(`${fieldName} contains unsupported fields.`);
  const normalized = {};
  if (fieldName === 'scoringRules') {
    if (value.placementPoints !== undefined) {
      if (!value.placementPoints || typeof value.placementPoints !== 'object' || Array.isArray(value.placementPoints)) throw new Error('scoringRules.placementPoints must be an object.');
      normalized.placementPoints = {};
      for (const [placement, points] of Object.entries(value.placementPoints)) {
        if (!/^([1-9]|[1-9][0-9]|1[0-2][0-9]|1[3-9][0-9]|2[0-5][0-5])$/.test(placement) || !Number.isInteger(points) || points < 0 || points > 10000) throw new Error('scoringRules.placementPoints contains an invalid entry.');
        normalized.placementPoints[placement] = points;
      }
    }
    if (value.killPoints !== undefined && (!Number.isInteger(value.killPoints) || value.killPoints < 0 || value.killPoints > 10000)) throw new Error('scoringRules.killPoints must be an integer from 0 to 10000.');
    if (value.killPoints !== undefined) normalized.killPoints = value.killPoints;
  } else {
    if (value.enabled !== undefined && typeof value.enabled !== 'boolean') throw new Error('rankingIntegration.enabled must be boolean.');
    if (value.verifiedOnly !== undefined && typeof value.verifiedOnly !== 'boolean') throw new Error('rankingIntegration.verifiedOnly must be boolean.');
    if (value.taskId !== undefined && (typeof value.taskId !== 'string' || !/^[a-zA-Z0-9:_-]{1,120}$/.test(value.taskId))) throw new Error('rankingIntegration.taskId is invalid.');
    if (value.enabled !== undefined) normalized.enabled = value.enabled;
    if (value.verifiedOnly !== undefined) normalized.verifiedOnly = value.verifiedOnly;
    if (value.taskId !== undefined) normalized.taskId = value.taskId;
  }
  return normalized;
}

function validateTournamentPayload(payload, { partial = false } = {}) {
  const candidate = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const allowedFields = new Set(['eventId', 'name', 'description', 'format', 'gameMode', 'teamSize', 'maxTeams', 'registrationOpenAt', 'registrationCloseAt', 'startAt', 'endAt', 'scoringRules', 'rankingIntegration']);
  if (Object.keys(candidate).some((field) => !allowedFields.has(field))) throw new Error('Tournament contains unsupported or server-controlled fields.');
  const normalized = {};
  if (candidate.eventId !== undefined || !partial) {
    if (typeof candidate.eventId !== 'string' || !candidate.eventId.trim()) throw new Error('eventId is required.');
    normalized.eventId = candidate.eventId.trim();
  }
  for (const field of ['name', 'description', 'gameMode']) {
    if (candidate[field] === undefined && partial) continue;
    if (typeof candidate[field] !== 'string' || !candidate[field].trim()) throw new Error(`${field} is required.`);
    const maxLength = field === 'description' ? 2000 : field === 'name' ? 120 : 80;
    if (candidate[field].trim().length > maxLength) throw new Error(`${field} is too long.`);
    normalized[field] = candidate[field].trim();
  }
  if (candidate.format !== undefined || !partial) {
    if (!tournamentFormats.has(candidate.format)) throw new Error('Only single_elimination is currently supported.');
    normalized.format = candidate.format;
  }
  for (const field of ['teamSize', 'maxTeams']) {
    if (candidate[field] === undefined && partial) continue;
    const value = Number(candidate[field]);
    const maximum = field === 'teamSize' ? 4 : 256;
    if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`${field} must be an integer from 1 to ${maximum}.`);
    normalized[field] = value;
  }
  for (const field of ['registrationOpenAt', 'registrationCloseAt', 'startAt', 'endAt']) {
    if (candidate[field] === undefined && partial) continue;
    normalized[field] = normalizeTournamentDate(candidate[field], field);
  }
  const scoringRules = validateTournamentRules(candidate.scoringRules, 'scoringRules', { partial });
  const rankingIntegration = validateTournamentRules(candidate.rankingIntegration, 'rankingIntegration', { partial });
  if (scoringRules !== undefined) normalized.scoringRules = scoringRules;
  if (rankingIntegration !== undefined) normalized.rankingIntegration = rankingIntegration;
  const values = { ...candidate, ...normalized };
  const dateFields = ['registrationOpenAt', 'registrationCloseAt', 'startAt', 'endAt'];
  if (dateFields.every((field) => values[field])) {
    const dates = dateFields.map((field) => Date.parse(values[field]));
    if (dates.some(Number.isNaN) || dates.some((date, index) => index > 0 && date < dates[index - 1])) throw new Error('Tournament dates must be ordered: registration open, registration close, start, end.');
  }
  if (values.maxTeams !== undefined && values.teamSize !== undefined && values.maxTeams < 2) throw new Error('A tournament must allow at least two teams.');
  return normalized;
}

async function getTournamentDocument(tournamentId) {
  const db = await getDatabase();
  const tournament = db
    ? await db.collection(collectionNames.tournaments).findOne({ id: tournamentId })
    : getLocalDocuments(collectionNames.tournaments).find((item) => item.id === tournamentId) || null;
  return publicTournament(tournament);
}

async function listTournamentDocuments(eventId) {
  const db = await getDatabase();
  if (db) return db.collection(collectionNames.tournaments).find(eventId ? { eventId } : {}).sort({ createdAt: -1 }).toArray();
  return getLocalDocuments(collectionNames.tournaments).filter((item) => !eventId || item.eventId === eventId).sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt)));
}

async function persistTournamentDocument(tournament) {
  const db = await getDatabase();
  if (db) {
    await db.collection(collectionNames.tournaments).replaceOne({ id: tournament.id }, tournament, { upsert: true });
    return tournament;
  }
  saveLocalDocument(collectionNames.tournaments, tournament);
  return tournament;
}

app.get('/api/tournaments', async (request, response) => {
  const session = requirePermission(request, response, 'member.read');
  if (!session) return;
  const eventId = typeof request.query.eventId === 'string' ? request.query.eventId.trim() : '';
  try {
    const tournaments = await listTournamentDocuments(eventId);
    response.json(tournaments.map(publicTournament));
  } catch (error) {
    response.status(503).json({ error: `Tournament data is temporarily unavailable: ${error.message}` });
  }
});

app.get('/api/tournaments/:id', async (request, response) => {
  const session = requirePermission(request, response, 'member.read');
  if (!session) return;
  const tournament = await getTournamentDocument(request.params.id);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  response.json(publicTournament(tournament));
});

app.post('/api/tournaments', async (request, response) => {
  const session = requirePermission(request, response, 'member.manage');
  if (!session) return;
  try {
    const payload = validateTournamentPayload(request.body);
    const event = await getEventDocument(payload.eventId);
    if (!event || event.type !== 'tournament') return response.status(400).json({ error: 'Tournament must belong to an existing tournament event.' });
    if (event.status === 'cancelled' || event.status === 'completed') return response.status(409).json({ error: 'Tournament cannot be created for a completed or cancelled event.' });
    const existing = await listTournamentDocuments(payload.eventId);
    if (existing.length > 0) return response.status(409).json({ error: 'This event already has a tournament.' });
    const timestamp = new Date().toISOString();
    const tournament = {
      id: `tournament-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      ...payload,
      status: 'draft',
      createdBy: session.id,
      updatedBy: session.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await persistTournamentDocument(tournament);
    void recordAuditEvent({ eventType: 'tournament_created', action: 'tournament_created', source: 'admin', request, actor: session, target: tournament, newValue: { eventId: tournament.eventId, format: tournament.format, status: tournament.status }, reason: 'Authorized tournament creation' });
    response.status(201).json(publicTournament(tournament));
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.patch('/api/tournaments/:id', async (request, response) => {
  const session = requirePermission(request, response, 'member.manage');
  if (!session) return;
  const forbiddenFields = ['id', 'eventId', 'status', 'createdBy', 'updatedBy', 'createdAt', 'updatedAt', 'winner', 'winnerId', 'score', 'scores', 'rankingPoints', 'points'];
  if (Object.keys(request.body || {}).some((field) => forbiddenFields.includes(field))) return response.status(400).json({ error: 'Tournament identity, lifecycle, result, ranking, and audit fields are server-controlled.' });
  const existing = await getTournamentDocument(request.params.id);
  if (!existing) return response.status(404).json({ error: 'Tournament not found.' });
  try {
    const changes = validateTournamentPayload(request.body, { partial: true });
    const merged = validateTournamentPayload({ ...existing, ...changes, eventId: existing.eventId });
    const nextTournament = { ...existing, ...merged, updatedBy: session.id, updatedAt: new Date().toISOString() };
    await persistTournamentDocument(nextTournament);
    void recordAuditEvent({ eventType: 'tournament_updated', action: 'tournament_updated', source: 'admin', request, actor: session, target: existing, previousValue: { fields: Object.keys(merged) }, newValue: { fields: Object.keys(merged) }, reason: 'Authorized tournament update' });
    response.json(publicTournament(nextTournament));
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.post('/api/tournaments/:id/status', async (request, response) => {
  const session = requirePermission(request, response, 'member.manage');
  if (!session) return;
  const tournament = await getTournamentDocument(request.params.id);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  const status = request.body?.status;
  if (!tournamentStatuses.has(status) || status === 'draft') return response.status(400).json({ error: 'Invalid tournament lifecycle status.' });
  if (tournament.status === 'completed' && status !== 'completed') return response.status(409).json({ error: 'Completed tournaments cannot be reopened.' });
  if (tournament.status === 'cancelled' && status !== 'cancelled') return response.status(409).json({ error: 'Cancelled tournaments cannot be reopened.' });
  if (status === 'active' && tournament.status === 'draft') return response.status(409).json({ error: 'Open registration before activating a tournament.' });
  const nextTournament = { ...tournament, status, updatedBy: session.id, updatedAt: new Date().toISOString() };
  await persistTournamentDocument(nextTournament);
  void recordAuditEvent({ eventType: 'tournament_status_changed', action: 'tournament_status_changed', source: 'admin', request, actor: session, target: tournament, previousValue: { status: tournament.status }, newValue: { status }, reason: 'Authorized tournament lifecycle change' });
  response.json(publicTournament(nextTournament));
});

function publicTournamentParticipant(participant) {
  if (!participant) return participant;
  const { _id, ...safeParticipant } = participant;
  return safeParticipant;
}

async function getTournamentParticipantDocument(tournamentId, memberId) {
  const db = await getDatabase();
  return db
    ? await db.collection(collectionNames['tournament-participants']).findOne({ tournamentId, memberId })
    : getLocalDocuments(collectionNames['tournament-participants']).find((item) => item.tournamentId === tournamentId && item.memberId === memberId) || null;
}

async function getTournamentParticipantById(tournamentId, participantId) {
  const db = await getDatabase();
  return db
    ? await db.collection(collectionNames['tournament-participants']).findOne({ id: participantId, tournamentId })
    : getLocalDocuments(collectionNames['tournament-participants']).find((item) => item.id === participantId && item.tournamentId === tournamentId) || null;
}

async function listTournamentParticipantDocuments(tournamentId) {
  const db = await getDatabase();
  if (db) return db.collection(collectionNames['tournament-participants']).find({ tournamentId }).sort({ registeredAt: 1 }).toArray();
  return getLocalDocuments(collectionNames['tournament-participants'])
    .filter((item) => item.tournamentId === tournamentId)
    .sort((first, second) => String(first.registeredAt).localeCompare(String(second.registeredAt)));
}

async function persistTournamentParticipantDocument(participant) {
  const db = await getDatabase();
  if (db) {
    const collection = db.collection(collectionNames['tournament-participants']);
    tournamentParticipantIndexPromise ||= collection.createIndex({ tournamentId: 1, memberId: 1 }, { unique: true });
    await tournamentParticipantIndexPromise;
    await collection.replaceOne({ id: participant.id }, participant, { upsert: true });
    return participant;
  }
  saveLocalDocument(collectionNames['tournament-participants'], participant);
  return participant;
}

function withTournamentTeamLock(tournamentId, operation) {
  const previous = tournamentTeamLocks.get(tournamentId) || Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  tournamentTeamLocks.set(tournamentId, current);
  return current.finally(() => {
    if (tournamentTeamLocks.get(tournamentId) === current) tournamentTeamLocks.delete(tournamentId);
  });
}

function publicTournamentTeam(team) {
  if (!team) return team;
  const { _id, ...safeTeam } = team;
  return safeTeam;
}

async function getTournamentTeamDocument(teamId, tournamentId) {
  const db = await getDatabase();
  return db
    ? await db.collection(tournamentTeamsCollection).findOne({ id: teamId, tournamentId })
    : getLocalDocuments(tournamentTeamsCollection).find((item) => item.id === teamId && item.tournamentId === tournamentId) || null;
}

async function listTournamentTeamDocuments(tournamentId) {
  const db = await getDatabase();
  if (db) return db.collection(tournamentTeamsCollection).find({ tournamentId }).sort({ createdAt: 1 }).toArray();
  return getLocalDocuments(tournamentTeamsCollection)
    .filter((item) => item.tournamentId === tournamentId)
    .sort((first, second) => String(first.createdAt).localeCompare(String(second.createdAt)));
}

async function persistTournamentTeamDocument(team) {
  const db = await getDatabase();
  if (db) {
    await db.collection(tournamentTeamsCollection).replaceOne({ id: team.id }, team, { upsert: true });
    return team;
  }
  saveLocalDocument(tournamentTeamsCollection, team);
  return team;
}

async function getRegisteredTournamentParticipant(tournamentId, memberId) {
  const participant = await getTournamentParticipantDocument(tournamentId, memberId);
  return participant?.status === 'registered' ? participant : null;
}

async function getCurrentTournamentMember(memberId) {
  const member = await findMemberById(memberId);
  if (!member || member.status !== 'approved' || member.status === 'suspended' || member.isInDiscordGuild !== true || member.discordLeftAt) return null;
  return member;
}

async function validateTournamentTeamMembers(tournament, memberIds, captainMemberId, existingTeamId) {
  if (!Array.isArray(memberIds) || memberIds.length === 0) throw new Error('A team must contain at least one member.');
  if (new Set(memberIds).size !== memberIds.length) throw new Error('Duplicate member IDs are not allowed.');
  if (!memberIds.includes(captainMemberId)) throw new Error('The captain must be part of the team.');
  if (memberIds.length > Number(tournament.teamSize)) throw new Error(`This tournament allows a maximum of ${tournament.teamSize} members per team.`);
  const members = await Promise.all(memberIds.map((memberId) => getCurrentTournamentMember(memberId)));
  if (members.some((member) => !member)) throw new Error('Every team member must be an approved, active Discord guild member.');
  const registrations = await Promise.all(memberIds.map((memberId) => getRegisteredTournamentParticipant(tournament.id, memberId)));
  if (registrations.some((participant) => !participant)) throw new Error('Every team member must be a registered tournament participant.');
  const teams = await listTournamentTeamDocuments(tournament.id);
  const conflictingTeam = teams.find((team) => team.status === 'active' && team.id !== existingTeamId && team.memberIds?.some((memberId) => memberIds.includes(memberId)));
  if (conflictingTeam) throw new Error('A member cannot belong to two active teams in the same tournament.');
  return members;
}

function withTournamentMatchLock(tournamentId, operation) {
  const previous = tournamentMatchLocks.get(tournamentId) || Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  tournamentMatchLocks.set(tournamentId, current);
  return current.finally(() => {
    if (tournamentMatchLocks.get(tournamentId) === current) tournamentMatchLocks.delete(tournamentId);
  });
}

function publicTournamentMatch(match) {
  if (!match) return match;
  const { _id, ...safeMatch } = match;
  return safeMatch;
}

async function getTournamentMatchDocument(matchId, tournamentId) {
  const db = await getDatabase();
  return db
    ? await db.collection(tournamentMatchesCollection).findOne({ id: matchId, tournamentId })
    : getLocalDocuments(tournamentMatchesCollection).find((item) => item.id === matchId && item.tournamentId === tournamentId) || null;
}

async function listTournamentMatchDocuments(tournamentId) {
  const db = await getDatabase();
  if (db) return db.collection(tournamentMatchesCollection).find({ tournamentId }).sort({ round: 1, matchNumber: 1 }).toArray();
  return getLocalDocuments(tournamentMatchesCollection)
    .filter((item) => item.tournamentId === tournamentId)
    .sort((first, second) => Number(first.round) - Number(second.round) || Number(first.matchNumber) - Number(second.matchNumber));
}

async function persistTournamentMatchDocument(match) {
  const db = await getDatabase();
  if (db) {
    const collection = db.collection(tournamentMatchesCollection);
    await collection.createIndex({ tournamentId: 1, round: 1, matchNumber: 1 }, { unique: true });
    await collection.replaceOne({ id: match.id }, match, { upsert: true });
    return match;
  }
  saveLocalDocument(tournamentMatchesCollection, match);
  return match;
}

function validateMatchNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 1000000) throw new Error(`${fieldName} must be a positive integer.`);
  return number;
}

async function validateTournamentMatchStructure(tournament, candidate, existingMatchId) {
  const round = validateMatchNumber(candidate.round, 'round');
  const matchNumber = validateMatchNumber(candidate.matchNumber, 'matchNumber');
  if (typeof candidate.participantA !== 'string' || typeof candidate.participantB !== 'string' || !candidate.participantA.trim() || !candidate.participantB.trim()) throw new Error('Both match participants are required.');
  const participantA = candidate.participantA.trim();
  const participantB = candidate.participantB.trim();
  if (participantA === participantB) throw new Error('A match cannot contain the same participant twice.');
  const teams = await listTournamentTeamDocuments(tournament.id);
  const validTeamIds = new Set(teams.filter((team) => team.status === 'active').map((team) => team.id));
  if (!validTeamIds.has(participantA) || !validTeamIds.has(participantB)) throw new Error('Match participants must be active teams in the same tournament.');
  if (candidate.nextMatchId !== null && candidate.nextMatchId !== undefined) {
    if (typeof candidate.nextMatchId !== 'string' || !candidate.nextMatchId.trim() || candidate.nextMatchId.trim() === existingMatchId) throw new Error('nextMatchId must reference another match in the same tournament.');
    const nextMatch = await getTournamentMatchDocument(candidate.nextMatchId.trim(), tournament.id);
    if (!nextMatch) throw new Error('nextMatchId must reference another match in the same tournament.');
  }
  if (candidate.scheduledAt !== null && candidate.scheduledAt !== undefined) {
    candidate.scheduledAt = normalizeTournamentDate(candidate.scheduledAt, 'scheduledAt');
    const scheduledAt = Date.parse(candidate.scheduledAt);
    if (scheduledAt < Date.parse(tournament.startAt) || scheduledAt > Date.parse(tournament.endAt)) throw new Error('scheduledAt must fall within the tournament start and end dates.');
  }
  const matches = await listTournamentMatchDocuments(tournament.id);
  const conflictingSlot = matches.find((match) => match.id !== existingMatchId && match.status !== 'cancelled' && Number(match.round) === round && Number(match.matchNumber) === matchNumber);
  if (conflictingSlot) throw new Error('A non-cancelled match already occupies this round and match number.');
  const conflictingParticipant = matches.find((match) => match.id !== existingMatchId && match.status !== 'cancelled' && Number(match.round) === round && [match.participantA, match.participantB].some((participant) => participant === participantA || participant === participantB));
  if (conflictingParticipant) throw new Error('A participant cannot appear in two non-cancelled matches in the same round.');
  if (candidate.nextMatchId) {
    const conflictingNextMatch = matches.find((match) => match.id !== existingMatchId && match.status !== 'cancelled' && match.nextMatchId === candidate.nextMatchId);
    if (conflictingNextMatch) throw new Error('A next match cannot have multiple incoming matches in this foundation.');
  }
  return { ...candidate, round, matchNumber, participantA, participantB, nextMatchId: candidate.nextMatchId ? candidate.nextMatchId.trim() : null, scheduledAt: candidate.scheduledAt || null };
}

function getTournamentRegistrationError(tournament, member, existingParticipant, registeredCount) {
  if (!member) return 'Member not found.';
  if (member.status !== 'approved') return 'Only approved members can register for tournaments.';
  if (member.status === 'suspended') return 'Suspended members cannot register for tournaments.';
  if (member.isInDiscordGuild !== true || member.discordLeftAt) return 'You must currently be in the Discord guild to register for this tournament.';
  if (tournament.status !== 'registration_open') return 'Tournament registration is not open.';
  const now = Date.now();
  const registrationOpenAt = Date.parse(tournament.registrationOpenAt);
  const registrationCloseAt = Date.parse(tournament.registrationCloseAt);
  if (Number.isNaN(registrationOpenAt) || Number.isNaN(registrationCloseAt)) return 'Tournament registration dates are invalid.';
  if (now < registrationOpenAt) return 'Tournament registration has not opened yet.';
  if (now > registrationCloseAt) return 'Tournament registration is closed.';
  if (existingParticipant?.status === 'registered') return 'You are already registered for this tournament.';
  if (existingParticipant?.status === 'disqualified') return 'This member is disqualified from the tournament.';
  const capacity = Number(tournament.maxTeams) * Number(tournament.teamSize);
  if (!Number.isInteger(capacity) || capacity < 1) return 'Tournament capacity is invalid.';
  if (registeredCount >= capacity) return 'This tournament is full.';
  return null;
}

async function countRegisteredTournamentParticipants(tournamentId, excludeParticipantId) {
  const participants = await listTournamentParticipantDocuments(tournamentId);
  return participants.filter((participant) => participant.status === 'registered' && participant.id !== excludeParticipantId).length;
}

app.get('/api/tournaments/:id/participants', async (request, response) => {
  const session = requirePermission(request, response, 'member.read');
  if (!session) return;
  const tournament = await getTournamentDocument(request.params.id);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  try {
    const participants = await listTournamentParticipantDocuments(tournament.id);
    response.json(participants.map(publicTournamentParticipant));
  } catch (error) {
    response.status(503).json({ error: `Tournament participants are temporarily unavailable: ${error.message}` });
  }
});

app.post('/api/tournaments/:id/register', async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  if (request.body && Object.prototype.hasOwnProperty.call(request.body, 'memberId')) return response.status(400).json({ error: 'The registering member is determined by the authenticated session.' });
  const tournament = await getTournamentDocument(request.params.id);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  const member = await findMemberById(session.id);
  const existingParticipant = await getTournamentParticipantDocument(tournament.id, session.id);
  const registeredCount = await countRegisteredTournamentParticipants(tournament.id, existingParticipant?.id);
  const registrationError = getTournamentRegistrationError(tournament, member, existingParticipant, registeredCount);
  if (registrationError) return response.status(409).json({ error: registrationError });
  const timestamp = new Date().toISOString();
  const participant = {
    id: existingParticipant?.id || `tournament-participant-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    tournamentId: tournament.id,
    memberId: session.id,
    status: 'registered',
    registeredAt: existingParticipant?.registeredAt || timestamp,
    updatedAt: timestamp,
  };
  try {
    await persistTournamentParticipantDocument(participant);
  } catch (error) {
    if (error?.code === 11000) return response.status(409).json({ error: 'You are already registered for this tournament.' });
    throw error;
  }
  void recordAuditEvent({ eventType: 'tournament_registration', action: 'tournament_registration', source: 'member', request, actor: session, target: { id: tournament.id, displayName: tournament.name }, newValue: { participantId: participant.id, memberId: session.id, status: participant.status }, reason: 'Authenticated member registered for tournament' });
  response.status(existingParticipant ? 200 : 201).json(publicTournamentParticipant(participant));
});

app.post('/api/tournaments/:id/withdraw', async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  if (request.body && Object.prototype.hasOwnProperty.call(request.body, 'memberId')) return response.status(400).json({ error: 'The withdrawing member is determined by the authenticated session.' });
  const tournament = await getTournamentDocument(request.params.id);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  const participant = await getTournamentParticipantDocument(tournament.id, session.id);
  if (!participant) return response.status(404).json({ error: 'Tournament registration not found.' });
  if (participant.status === 'disqualified') return response.status(409).json({ error: 'A disqualified registration cannot be withdrawn.' });
  if (participant.status === 'withdrawn') return response.json(publicTournamentParticipant(participant));
  const nextParticipant = { ...participant, status: 'withdrawn', updatedAt: new Date().toISOString() };
  await persistTournamentParticipantDocument(nextParticipant);
  response.json(publicTournamentParticipant(nextParticipant));
});

app.patch('/api/tournaments/:tournamentId/participants/:participantId', async (request, response) => {
  const session = requirePermission(request, response, 'member.manage');
  if (!session) return;
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  if (Object.keys(body).some((field) => field !== 'status')) return response.status(400).json({ error: 'Only participant status can be managed here.' });
  if (!tournamentParticipantStatuses.has(body.status)) return response.status(400).json({ error: 'Invalid tournament participant status.' });
  const tournament = await getTournamentDocument(request.params.tournamentId);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  const participant = await getTournamentParticipantById(tournament.id, request.params.participantId);
  if (!participant) return response.status(404).json({ error: 'Tournament participant not found.' });
  const targetMember = await findMemberById(participant.memberId);
  if (body.status === 'registered') {
    const registeredCount = await countRegisteredTournamentParticipants(tournament.id, participant.id);
    const registrationError = getTournamentRegistrationError(tournament, targetMember, participant, registeredCount);
    if (registrationError) return response.status(409).json({ error: registrationError });
  }
  const nextParticipant = { ...participant, status: body.status, updatedAt: new Date().toISOString() };
  await persistTournamentParticipantDocument(nextParticipant);
  void recordAuditEvent({ eventType: 'tournament_participant_updated', action: 'tournament_participant_updated', source: 'admin', request, actor: session, target: { id: participant.memberId }, previousValue: { tournamentId: tournament.id, participantId: participant.id, status: participant.status }, newValue: { tournamentId: tournament.id, participantId: participant.id, status: nextParticipant.status }, reason: 'Authorized tournament participant status change' });
  response.json(publicTournamentParticipant(nextParticipant));
});

app.get('/api/tournaments/:id/teams', async (request, response) => {
  const session = requirePermission(request, response, 'member.read');
  if (!session) return;
  const tournament = await getTournamentDocument(request.params.id);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  try {
    const teams = await listTournamentTeamDocuments(tournament.id);
    response.json(teams.map(publicTournamentTeam));
  } catch (error) {
    response.status(503).json({ error: `Tournament teams are temporarily unavailable: ${error.message}` });
  }
});

app.post('/api/tournaments/:id/teams', async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const allowedFields = new Set(['name', 'memberIds', 'captainMemberId']);
  if (Object.keys(body).some((field) => !allowedFields.has(field))) return response.status(400).json({ error: 'Team contains unsupported or server-controlled fields.' });
  const tournament = await getTournamentDocument(request.params.id);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  if (['draft', 'completed', 'cancelled'].includes(tournament.status)) return response.status(409).json({ error: 'Teams cannot be created in the current tournament state.' });
  const isStaff = hasPermission(session, 'member.manage');
  const captainMemberId = isStaff && typeof body.captainMemberId === 'string' ? body.captainMemberId.trim() : session.id;
  if (!isStaff && body.captainMemberId !== undefined && body.captainMemberId !== session.id) return response.status(403).json({ error: 'You can only create a team for yourself.' });
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 80) return response.status(400).json({ error: 'Team name is required and must be 80 characters or fewer.' });
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map((memberId) => String(memberId).trim()) : [captainMemberId];
  if (!isStaff && !memberIds.includes(session.id)) return response.status(403).json({ error: 'You must be part of the team you create.' });
  try {
    await withTournamentTeamLock(tournament.id, async () => {
      const teams = await listTournamentTeamDocuments(tournament.id);
      if (teams.filter((team) => team.status === 'active').length >= Number(tournament.maxTeams)) throw new Error('This tournament already has the maximum number of active teams.');
      await validateTournamentTeamMembers(tournament, memberIds, captainMemberId);
      const timestamp = new Date().toISOString();
      const team = {
        id: `tournament-team-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        tournamentId: tournament.id,
        name: body.name.trim(),
        captainMemberId,
        memberIds,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await persistTournamentTeamDocument(team);
      void recordAuditEvent({ eventType: 'tournament_team_created', action: 'tournament_team_created', source: isStaff ? 'admin' : 'member', request, actor: session, target: team, newValue: { tournamentId: team.tournamentId, captainMemberId: team.captainMemberId, memberIds: team.memberIds, status: team.status }, reason: isStaff ? 'Authorized staff team creation' : 'Member team creation' });
      response.status(201).json(publicTournamentTeam(team));
    });
  } catch (error) {
    response.status(error.message.includes('maximum') || error.message.includes('two active') ? 409 : 400).json({ error: error.message });
  }
});

app.patch('/api/tournaments/:tournamentId/teams/:teamId', async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const allowedFields = new Set(['name', 'memberIds', 'captainMemberId', 'status']);
  if (Object.keys(body).some((field) => !allowedFields.has(field))) return response.status(400).json({ error: 'Team contains unsupported or server-controlled fields.' });
  if (body.status !== undefined && !tournamentTeamStatuses.has(body.status)) return response.status(400).json({ error: 'Invalid tournament team status.' });
  const tournament = await getTournamentDocument(request.params.tournamentId);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  const team = await getTournamentTeamDocument(request.params.teamId, tournament.id);
  if (!team) return response.status(404).json({ error: 'Tournament team not found.' });
  const isStaff = hasPermission(session, 'member.manage');
  if (!isStaff && team.captainMemberId !== session.id) return response.status(403).json({ error: 'You can only modify your own team.' });
  if (!isStaff && (body.captainMemberId !== undefined || body.status !== undefined)) return response.status(403).json({ error: 'Only staff can transfer captaincy or change team status.' });
  if (!isStaff && team.status !== 'active') return response.status(409).json({ error: 'This team is no longer active.' });
  try {
    await withTournamentTeamLock(tournament.id, async () => {
      const nextName = body.name === undefined ? team.name : String(body.name).trim();
      if (!nextName || nextName.length > 80) throw new Error('Team name is required and must be 80 characters or fewer.');
      const nextStatus = body.status === undefined ? team.status : body.status;
      const nextCaptain = body.captainMemberId === undefined ? team.captainMemberId : String(body.captainMemberId).trim();
      const nextMemberIds = body.memberIds === undefined ? team.memberIds : (Array.isArray(body.memberIds) ? body.memberIds.map((memberId) => String(memberId).trim()) : null);
      if (!nextMemberIds) throw new Error('memberIds must be an array.');
      if (['completed', 'cancelled'].includes(tournament.status) && (nextStatus === 'active' || body.memberIds !== undefined || body.captainMemberId !== undefined)) throw new Error('Completed or cancelled tournaments cannot change active team membership.');
      if (nextStatus === 'active') await validateTournamentTeamMembers(tournament, nextMemberIds, nextCaptain, team.id);
      const nextTeam = { ...team, name: nextName, captainMemberId: nextCaptain, memberIds: nextMemberIds, status: nextStatus, updatedAt: new Date().toISOString() };
      await persistTournamentTeamDocument(nextTeam);
      if (isStaff) void recordAuditEvent({ eventType: 'tournament_team_updated', action: 'tournament_team_updated', source: 'admin', request, actor: session, target: team, previousValue: { captainMemberId: team.captainMemberId, memberIds: team.memberIds, status: team.status }, newValue: { captainMemberId: nextTeam.captainMemberId, memberIds: nextTeam.memberIds, status: nextTeam.status }, reason: 'Authorized staff team update' });
      response.json(publicTournamentTeam(nextTeam));
    });
  } catch (error) {
    response.status(error.message.includes('two active') || error.message.includes('maximum') ? 409 : 400).json({ error: error.message });
  }
});

app.get('/api/tournaments/:id/matches', async (request, response) => {
  const session = requirePermission(request, response, 'member.read');
  if (!session) return;
  const tournament = await getTournamentDocument(request.params.id);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  try {
    const matches = await listTournamentMatchDocuments(tournament.id);
    const rawPage = Number.parseInt(String(request.query.page || '1'), 10);
    const rawLimit = Number.parseInt(String(request.query.limit || '50'), 10);
    const page = Number.isInteger(rawPage) ? Math.max(rawPage, 1) : 1;
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
    const total = matches.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, pages);
    const start = (safePage - 1) * limit;
    response.json({ items: matches.slice(start, start + limit).map(publicTournamentMatch), page: safePage, limit, total, pages });
  } catch (error) {
    response.status(503).json({ error: `Tournament matches are temporarily unavailable: ${error.message}` });
  }
});

app.post('/api/tournaments/:id/matches', async (request, response) => {
  const session = requirePermission(request, response, 'member.manage');
  if (!session) return;
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const allowedFields = new Set(['round', 'matchNumber', 'participantA', 'participantB', 'scheduledAt', 'nextMatchId']);
  if (Object.keys(body).some((field) => !allowedFields.has(field))) return response.status(400).json({ error: 'Match contains unsupported or server-controlled fields.' });
  const tournament = await getTournamentDocument(request.params.id);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  if (['draft', 'completed', 'cancelled'].includes(tournament.status)) return response.status(409).json({ error: 'Matches cannot be created in the current tournament state.' });
  try {
    await withTournamentMatchLock(tournament.id, async () => {
      const structure = await validateTournamentMatchStructure(tournament, { ...body, nextMatchId: body.nextMatchId ?? null }, null);
      const timestamp = new Date().toISOString();
      const match = {
        id: `tournament-match-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        tournamentId: tournament.id,
        round: structure.round,
        matchNumber: structure.matchNumber,
        participantA: structure.participantA,
        participantB: structure.participantB,
        scheduledAt: structure.scheduledAt,
        status: 'pending',
        resultId: null,
        winnerId: null,
        nextMatchId: structure.nextMatchId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await persistTournamentMatchDocument(match);
      void recordAuditEvent({ eventType: 'tournament_match_created', action: 'tournament_match_created', source: 'admin', request, actor: session, target: match, newValue: { tournamentId: match.tournamentId, round: match.round, matchNumber: match.matchNumber, participantA: match.participantA, participantB: match.participantB, status: match.status }, reason: 'Authorized match structure creation' });
      response.status(201).json(publicTournamentMatch(match));
    });
  } catch (error) {
    const conflict = error.code === 11000 || /already|cannot appear|multiple incoming|occupies/.test(error.message);
    response.status(conflict ? 409 : 400).json({ error: error.message });
  }
});

app.patch('/api/tournaments/:tournamentId/matches/:matchId', async (request, response) => {
  const session = requirePermission(request, response, 'member.manage');
  if (!session) return;
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const allowedFields = new Set(['round', 'matchNumber', 'participantA', 'participantB', 'scheduledAt', 'status', 'nextMatchId']);
  const forbiddenFields = ['id', 'tournamentId', 'resultId', 'winnerId', 'createdAt', 'updatedAt'];
  if (Object.keys(body).some((field) => forbiddenFields.includes(field))) return response.status(400).json({ error: 'Match identity, result, winner, and audit fields are server-controlled.' });
  if (Object.keys(body).some((field) => !allowedFields.has(field))) return response.status(400).json({ error: 'Match contains unsupported fields.' });
  if (body.status !== undefined && !tournamentMatchStatuses.has(body.status)) return response.status(400).json({ error: 'Invalid tournament match status.' });
  if (body.status === 'completed' || body.status === 'disputed') return response.status(409).json({ error: 'Match completion and disputes require result verification and are not implemented yet.' });
  const tournament = await getTournamentDocument(request.params.tournamentId);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  const existingMatch = await getTournamentMatchDocument(request.params.matchId, tournament.id);
  if (!existingMatch) return response.status(404).json({ error: 'Tournament match not found.' });
  if (existingMatch.status === 'cancelled' && body.status !== 'cancelled') return response.status(409).json({ error: 'Cancelled matches cannot be reactivated.' });
  try {
    await withTournamentMatchLock(tournament.id, async () => {
      const candidate = {
        round: body.round ?? existingMatch.round,
        matchNumber: body.matchNumber ?? existingMatch.matchNumber,
        participantA: body.participantA ?? existingMatch.participantA,
        participantB: body.participantB ?? existingMatch.participantB,
        scheduledAt: body.scheduledAt === undefined ? existingMatch.scheduledAt : body.scheduledAt,
        nextMatchId: body.nextMatchId === undefined ? existingMatch.nextMatchId : body.nextMatchId,
      };
      const structure = await validateTournamentMatchStructure(tournament, candidate, existingMatch.id);
      const nextStatus = body.status ?? existingMatch.status;
      if ((nextStatus === 'scheduled' || nextStatus === 'live') && !structure.scheduledAt) throw new Error('Scheduled and live matches require scheduledAt.');
      if (existingMatch.status === 'live' && Object.keys(body).some((field) => ['round', 'matchNumber', 'participantA', 'participantB', 'nextMatchId'].includes(field))) throw new Error('Live match structure cannot be changed.');
      const nextMatch = { ...existingMatch, ...structure, status: nextStatus, resultId: null, winnerId: null, updatedAt: new Date().toISOString() };
      await persistTournamentMatchDocument(nextMatch);
      void recordAuditEvent({ eventType: 'tournament_match_updated', action: 'tournament_match_updated', source: 'admin', request, actor: session, target: existingMatch, previousValue: { round: existingMatch.round, matchNumber: existingMatch.matchNumber, participantA: existingMatch.participantA, participantB: existingMatch.participantB, scheduledAt: existingMatch.scheduledAt, status: existingMatch.status, nextMatchId: existingMatch.nextMatchId }, newValue: { round: nextMatch.round, matchNumber: nextMatch.matchNumber, participantA: nextMatch.participantA, participantB: nextMatch.participantB, scheduledAt: nextMatch.scheduledAt, status: nextMatch.status, nextMatchId: nextMatch.nextMatchId }, reason: 'Authorized match structure or schedule update' });
      response.json(publicTournamentMatch(nextMatch));
    });
  } catch (error) {
    const conflict = error.code === 11000 || /already|cannot appear|multiple incoming|occupies|cannot be changed|reactivated/.test(error.message);
    response.status(conflict ? 409 : 400).json({ error: error.message });
  }
});

function advanceByeParticipant(match) {
  const participants = [match.participantA, match.participantB].filter(Boolean);
  return participants.length === 1 ? participants[0] : null;
}

function buildSingleEliminationBracket(tournament, teams) {
  let bracketSize = 1;
  while (bracketSize < teams.length) bracketSize *= 2;
  const rounds = Math.log2(bracketSize);
  const roundMatches = [];
  for (let round = 1; round <= rounds; round += 1) {
    const matchesInRound = bracketSize / (2 ** round);
    roundMatches.push(Array.from({ length: matchesInRound }, (_, index) => ({
      id: `tournament-match-${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${round}-${index + 1}`,
      round,
      matchNumber: index + 1,
    })));
  }
  const byeCount = bracketSize - teams.length;
  const slots = [];
  let teamIndex = 0;
  for (let index = 0; index < byeCount; index += 1) {
    slots.push(teams[teamIndex++].id, null);
  }
  while (teamIndex < teams.length) slots.push(teams[teamIndex++].id);
  const timestamp = new Date().toISOString();
  const matches = [];
  for (let round = 1; round <= rounds; round += 1) {
    const currentRound = roundMatches[round - 1];
    currentRound.forEach((match, index) => {
      const previousRound = round === 1 ? null : roundMatches[round - 2];
      const participantA = round === 1 ? slots[index * 2] : advanceByeParticipant(matches.find((item) => item.id === previousRound[index * 2].id));
      const participantB = round === 1 ? slots[index * 2 + 1] : advanceByeParticipant(matches.find((item) => item.id === previousRound[index * 2 + 1].id));
      const nextMatchId = round < rounds ? roundMatches[round][Math.floor(index / 2)].id : null;
      matches.push({
        id: match.id,
        tournamentId: tournament.id,
        round: match.round,
        matchNumber: match.matchNumber,
        participantA,
        participantB,
        scheduledAt: null,
        status: 'pending',
        resultId: null,
        winnerId: null,
        nextMatchId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });
  }
  return { bracketSize, rounds, matches };
}

function publicTournamentBracket(tournamentId, bracketSize, rounds, matches) {
  return {
    tournamentId,
    format: 'single_elimination',
    bracketSize,
    rounds,
    matches: matches.map(publicTournamentMatch),
  };
}

app.get('/api/tournaments/:id/bracket', async (request, response) => {
  const session = requirePermission(request, response, 'member.read');
  if (!session) return;
  const tournament = await getTournamentDocument(request.params.id);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  const matches = await listTournamentMatchDocuments(tournament.id);
  if (matches.length === 0) return response.status(404).json({ error: 'The official bracket has not been generated.' });
  const rounds = Math.max(...matches.map((match) => Number(match.round)));
  const bracketSize = 2 ** rounds;
  response.json(publicTournamentBracket(tournament.id, bracketSize, rounds, matches));
});

app.get('/api/tournaments/:id/standings', async (request, response) => {
  const session = requirePermission(request, response, 'member.read');
  if (!session) return;
  const tournament = await getTournamentDocument(request.params.id);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  const rawPage = Number.parseInt(String(request.query.page || '1'), 10);
  const rawLimit = Number.parseInt(String(request.query.limit || '50'), 10);
  const page = Number.isInteger(rawPage) ? Math.max(rawPage, 1) : 1;
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
  try {
    const standings = await listTournamentStandingDocuments(tournament.id);
    response.json(paginateTournamentStandings(standings, page, limit));
  } catch (error) {
    response.status(503).json({ error: `Tournament standings are temporarily unavailable: ${error.message}` });
  }
});

app.post('/api/tournaments/:id/bracket/generate', async (request, response) => {
  const session = requirePermission(request, response, 'member.manage');
  if (!session) return;
  const tournament = await getTournamentDocument(request.params.id);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  if (tournament.format !== 'single_elimination') return response.status(409).json({ error: 'Only single_elimination brackets are supported.' });
  if (tournament.status !== 'registration_closed') return response.status(409).json({ error: 'Bracket generation requires a tournament with registration_closed status.' });
  try {
    await withTournamentMatchLock(tournament.id, async () => {
      const existingMatches = await listTournamentMatchDocuments(tournament.id);
      if (existingMatches.length > 0) throw new Error('The official bracket already exists. Regeneration is not supported.');
      const activeTeams = (await listTournamentTeamDocuments(tournament.id)).filter((team) => team.status === 'active');
      if (activeTeams.length < 2) throw new Error('At least two active teams are required to generate a bracket.');
      if (activeTeams.length > Number(tournament.maxTeams)) throw new Error('The registered team count exceeds the tournament limit.');
      const seenMembers = new Set();
      for (const team of activeTeams) {
        if (!Array.isArray(team.memberIds) || team.memberIds.length === 0) throw new Error('Every active team must contain registered members.');
        for (const memberId of team.memberIds) {
          if (seenMembers.has(memberId)) throw new Error('A member cannot appear on multiple active teams.');
          seenMembers.add(memberId);
          if (!await getRegisteredTournamentParticipant(tournament.id, memberId)) throw new Error('Every active team member must remain a registered tournament participant.');
          if (!await getCurrentTournamentMember(memberId)) throw new Error('Every active team member must remain an approved Discord guild member.');
        }
      }
      const bracket = buildSingleEliminationBracket(tournament, activeTeams);
      await initializeTournamentStandings(tournament, activeTeams);
      await Promise.all(bracket.matches.map((match) => persistTournamentMatchDocument(match)));
      void recordAuditEvent({ eventType: 'tournament_bracket_generated', action: 'tournament_bracket_generated', source: 'admin', request, actor: session, target: tournament, newValue: { tournamentId: tournament.id, format: tournament.format, bracketSize: bracket.bracketSize, rounds: bracket.rounds, matchCount: bracket.matches.length, teamCount: activeTeams.length }, reason: 'Authorized official single-elimination bracket generation' });
      response.status(201).json(publicTournamentBracket(tournament.id, bracket.bracketSize, bracket.rounds, bracket.matches));
    });
  } catch (error) {
    const conflict = /already exists|registration_closed|active teams|registered team count|member cannot|remain/.test(error.message);
    response.status(conflict ? 409 : 400).json({ error: error.message });
  }
});

function publicTournamentResult(result) {
  if (!result) return result;
  const { _id, ...safeResult } = result;
  return safeResult;
}

async function getTournamentResultDocument(resultId, tournamentId, matchId) {
  const db = await getDatabase();
  return db
    ? await db.collection(tournamentResultsCollection).findOne({ id: resultId, tournamentId, matchId })
    : getLocalDocuments(tournamentResultsCollection).find((item) => item.id === resultId && item.tournamentId === tournamentId && item.matchId === matchId) || null;
}

async function listTournamentResultDocuments(tournamentId, matchId) {
  const db = await getDatabase();
  if (db) return db.collection(tournamentResultsCollection).find({ tournamentId, matchId }).sort({ correctionVersion: -1, createdAt: -1 }).toArray();
  return getLocalDocuments(tournamentResultsCollection)
    .filter((item) => item.tournamentId === tournamentId && item.matchId === matchId)
    .sort((first, second) => Number(second.correctionVersion) - Number(first.correctionVersion) || String(second.createdAt).localeCompare(String(first.createdAt)));
}

async function persistTournamentResultDocument(result) {
  const db = await getDatabase();
  if (db) {
    const collection = db.collection(tournamentResultsCollection);
    await collection.createIndex({ matchId: 1, correctionVersion: 1 }, { unique: true });
    await collection.replaceOne({ id: result.id }, result, { upsert: true });
    return result;
  }
  saveLocalDocument(tournamentResultsCollection, result);
  return result;
}

function publicTournamentStanding(standing) {
  if (!standing) return standing;
  const { _id, ...safeStanding } = standing;
  return safeStanding;
}

async function listTournamentStandingDocuments(tournamentId) {
  const db = await getDatabase();
  if (db) return db.collection(tournamentStandingsCollection).find({ tournamentId }).sort({ wins: -1, losses: 1, matchesPlayed: -1, teamId: 1 }).toArray();
  return getLocalDocuments(tournamentStandingsCollection)
    .filter((item) => item.tournamentId === tournamentId)
    .sort((first, second) => Number(second.wins) - Number(first.wins) || Number(first.losses) - Number(second.losses) || Number(second.matchesPlayed) - Number(first.matchesPlayed) || String(first.teamId).localeCompare(String(second.teamId)));
}

async function persistTournamentStandingDocument(standing) {
  const db = await getDatabase();
  if (db) {
    const collection = db.collection(tournamentStandingsCollection);
    await collection.createIndex({ tournamentId: 1, teamId: 1 }, { unique: true });
    await collection.replaceOne({ id: standing.id }, standing, { upsert: true });
    return standing;
  }
  saveLocalDocument(tournamentStandingsCollection, standing);
  return standing;
}

async function updateTournamentStandingsForResult(tournament, match, winnerId) {
  const loserId = match.participantA === winnerId ? match.participantB : match.participantA;
  if (!winnerId || !loserId || winnerId === loserId) throw new Error('The official result does not identify a safe winner and loser.');
  const teams = await Promise.all([
    getTournamentTeamDocument(winnerId, tournament.id),
    getTournamentTeamDocument(loserId, tournament.id),
  ]);
  if (teams.some((team) => !team || team.status !== 'active')) throw new Error('The match contains a withdrawn or disqualified team and requires admin review.');
  for (const team of teams) {
    const memberState = await Promise.all(team.memberIds.map(async (memberId) => ({
      member: await getCurrentTournamentMember(memberId),
      participant: await getRegisteredTournamentParticipant(tournament.id, memberId),
    })));
    if (memberState.some(({ member, participant }) => !member || !participant)) throw new Error('A match team contains a withdrawn, disqualified, suspended, or departed member and requires admin review.');
  }
  const existingStandings = await listTournamentStandingDocuments(tournament.id);
  const timestamp = new Date().toISOString();
  const winnerStanding = existingStandings.find((standing) => standing.teamId === winnerId) || { id: `tournament-standing-${tournament.id}-${winnerId}`, tournamentId: tournament.id, teamId: winnerId, wins: 0, losses: 0, matchesPlayed: 0, placement: null, status: 'active' };
  const loserStanding = existingStandings.find((standing) => standing.teamId === loserId) || { id: `tournament-standing-${tournament.id}-${loserId}`, tournamentId: tournament.id, teamId: loserId, wins: 0, losses: 0, matchesPlayed: 0, placement: null, status: 'active' };
  if (winnerStanding.lastResultId === match.resultId || loserStanding.lastResultId === match.resultId) return existingStandings;
  await persistTournamentStandingDocument({ ...winnerStanding, wins: Number(winnerStanding.wins || 0) + 1, matchesPlayed: Number(winnerStanding.matchesPlayed || 0) + 1, status: 'active', lastResultId: match.resultId, updatedAt: timestamp });
  await persistTournamentStandingDocument({ ...loserStanding, losses: Number(loserStanding.losses || 0) + 1, matchesPlayed: Number(loserStanding.matchesPlayed || 0) + 1, status: 'eliminated', lastResultId: match.resultId, updatedAt: timestamp });
  return listTournamentStandingDocuments(tournament.id);
}

async function initializeTournamentStandings(tournament, teams) {
  const existingStandings = await listTournamentStandingDocuments(tournament.id);
  const existingTeamIds = new Set(existingStandings.map((standing) => standing.teamId));
  const timestamp = new Date().toISOString();
  await Promise.all(teams.filter((team) => !existingTeamIds.has(team.id)).map((team) => persistTournamentStandingDocument({
    id: `tournament-standing-${tournament.id}-${team.id}`,
    tournamentId: tournament.id,
    teamId: team.id,
    wins: 0,
    losses: 0,
    matchesPlayed: 0,
    placement: null,
    status: 'active',
    lastResultId: null,
    updatedAt: timestamp,
  })));
}

async function markMatchForReview(match, tournament, request, actor, reason) {
  const currentMatch = await getTournamentMatchDocument(match.id, tournament.id);
  if (!currentMatch || currentMatch.status === 'completed' || currentMatch.status === 'cancelled') return currentMatch;
  const disputedMatch = { ...currentMatch, status: 'disputed', updatedAt: new Date().toISOString() };
  await persistTournamentMatchDocument(disputedMatch);
  void recordAuditEvent({ eventType: 'tournament_match_review_required', action: 'tournament_match_review_required', source: 'admin', request, actor, target: match, previousValue: { status: currentMatch.status }, newValue: { status: disputedMatch.status }, reason });
  return disputedMatch;
}

function paginateTournamentStandings(standings, page, limit) {
  const total = standings.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * limit;
  const items = standings.slice(start, start + limit).map((standing, index) => publicTournamentStanding({ ...standing, placement: standing.placement || start + index + 1 }));
  return { items, page: safePage, limit, total, pages };
}

async function validateMatchResultAccess(session, match) {
  if (!match.participantA || !match.participantB) throw new Error('A result cannot be submitted for a bye or unresolved match.');
  const [teamA, teamB] = await Promise.all([
    getTournamentTeamDocument(match.participantA, match.tournamentId),
    getTournamentTeamDocument(match.participantB, match.tournamentId),
  ]);
  if (!teamA || !teamB || teamA.status !== 'active' || teamB.status !== 'active') throw new Error('Match participants are not valid active teams in this tournament.');
  const member = await getCurrentTournamentMember(session.id);
  if (!member) throw new Error('The submitter must be an approved, active Discord guild member.');
  if (!hasPermission(session, 'member.manage') && !teamA.memberIds.includes(session.id) && !teamB.memberIds.includes(session.id)) throw new Error('Only a match participant or authorized staff can submit this result.');
}

function validateMatchResultPayload(match, payload) {
  const candidate = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  if (!Number.isInteger(candidate.scoreA) || candidate.scoreA < 0 || candidate.scoreA > 1000000) throw new Error('scoreA must be an integer from 0 to 1000000.');
  if (!Number.isInteger(candidate.scoreB) || candidate.scoreB < 0 || candidate.scoreB > 1000000) throw new Error('scoreB must be an integer from 0 to 1000000.');
  if (typeof candidate.winnerId !== 'string' || ![match.participantA, match.participantB].includes(candidate.winnerId)) throw new Error('winnerId must be one of the official match participants.');
  if (candidate.winnerId === match.participantA && candidate.scoreA <= candidate.scoreB) throw new Error('The winning participant must have the higher score.');
  if (candidate.winnerId === match.participantB && candidate.scoreB <= candidate.scoreA) throw new Error('The winning participant must have the higher score.');
  return { scoreA: candidate.scoreA, scoreB: candidate.scoreB, winnerId: candidate.winnerId };
}

async function advanceVerifiedMatchWinner(match, winnerId) {
  if (!match.nextMatchId) return null;
  const nextMatch = await getTournamentMatchDocument(match.nextMatchId, match.tournamentId);
  if (!nextMatch) throw new Error('The official next match could not be found.');
  if (nextMatch.status === 'cancelled') throw new Error('The official next match is cancelled.');
  const field = Number(match.matchNumber) % 2 === 1 ? 'participantA' : 'participantB';
  if (nextMatch[field] && nextMatch[field] !== winnerId) throw new Error('The next match already contains a conflicting participant.');
  if (nextMatch[field] === winnerId) return nextMatch;
  const updatedNextMatch = { ...nextMatch, [field]: winnerId, updatedAt: new Date().toISOString() };
  await persistTournamentMatchDocument(updatedNextMatch);
  return updatedNextMatch;
}

app.get('/api/tournaments/:tournamentId/matches/:matchId/results', async (request, response) => {
  const session = requirePermission(request, response, 'member.read');
  if (!session) return;
  const tournament = await getTournamentDocument(request.params.tournamentId);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  const match = await getTournamentMatchDocument(request.params.matchId, tournament.id);
  if (!match) return response.status(404).json({ error: 'Tournament match not found.' });
  const results = await listTournamentResultDocuments(tournament.id, match.id);
  response.json(results.map(publicTournamentResult));
});

app.post('/api/tournaments/:tournamentId/matches/:matchId/results', async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  if (Object.keys(body).some((field) => !['scoreA', 'scoreB', 'winnerId'].includes(field))) return response.status(400).json({ error: 'Result contains unsupported or server-controlled fields.' });
  const tournament = await getTournamentDocument(request.params.tournamentId);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  const match = await getTournamentMatchDocument(request.params.matchId, tournament.id);
  if (!match) return response.status(404).json({ error: 'Tournament match not found.' });
  const results = await listTournamentResultDocuments(tournament.id, match.id);
  const latestResult = results[0];
  try {
    const payload = validateMatchResultPayload(match, body);
    if (latestResult?.status === 'verified') {
      if (latestResult.scoreA === payload.scoreA && latestResult.scoreB === payload.scoreB && latestResult.winnerId === payload.winnerId) return response.json(publicTournamentResult(latestResult));
      return response.status(409).json({ error: 'The official result cannot be overwritten.' });
    }
    if (match.status === 'cancelled') throw new Error('Cancelled matches cannot receive results.');
    if (['cancelled', 'completed'].includes(tournament.status)) throw new Error('Cancelled or completed tournaments cannot receive new results.');
    await validateMatchResultAccess(session, match);
    if (latestResult?.status === 'pending') {
      if (latestResult.scoreA === payload.scoreA && latestResult.scoreB === payload.scoreB && latestResult.winnerId === payload.winnerId) return response.json(publicTournamentResult(latestResult));
      return response.status(409).json({ error: 'A result is already pending verification for this match.' });
    }
    const timestamp = new Date().toISOString();
    const result = {
      id: `tournament-result-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      matchId: match.id,
      tournamentId: tournament.id,
      scoreA: payload.scoreA,
      scoreB: payload.scoreB,
      winnerId: payload.winnerId,
      submittedBy: session.id,
      status: 'pending',
      submittedAt: timestamp,
      verifiedBy: null,
      verifiedAt: null,
      correctionVersion: (Number(latestResult?.correctionVersion) || 0) + 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await persistTournamentResultDocument(result);
    void recordAuditEvent({ eventType: 'tournament_result_submitted', action: 'tournament_result_submitted', source: hasPermission(session, 'member.manage') ? 'admin' : 'member', request, actor: session, target: match, newValue: { resultId: result.id, matchId: result.matchId, winnerId: result.winnerId, status: result.status, correctionVersion: result.correctionVersion }, reason: 'Match result submitted for verification' });
    response.status(201).json(publicTournamentResult(result));
  } catch (error) {
    response.status(/official|pending|cancelled|completed|participant|higher score|active Discord/.test(error.message) ? 409 : 400).json({ error: error.message });
  }
});

app.post('/api/tournaments/:tournamentId/matches/:matchId/results/:resultId/verify', async (request, response) => {
  const session = requirePermission(request, response, 'member.manage');
  if (!session) return;
  const tournament = await getTournamentDocument(request.params.tournamentId);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  const match = await getTournamentMatchDocument(request.params.matchId, tournament.id);
  if (!match) return response.status(404).json({ error: 'Tournament match not found.' });
  const result = await getTournamentResultDocument(request.params.resultId, tournament.id, match.id);
  if (!result) return response.status(404).json({ error: 'Tournament result not found.' });
  if (!tournamentResultStatuses.has(result.status)) return response.status(400).json({ error: 'Invalid tournament result status.' });
  if (result.status === 'verified') return response.json(publicTournamentResult(result));
  let rankingIntegrationFailure = false;
  try {
    if (match.status === 'cancelled') throw new Error('Cancelled matches cannot be verified.');
    if (['cancelled', 'completed'].includes(tournament.status)) throw new Error('Cancelled or completed tournaments cannot verify new results.');
    const payload = validateMatchResultPayload(match, result);
    await withTournamentMatchLock(tournament.id, async () => {
      const currentResult = await getTournamentResultDocument(result.id, tournament.id, match.id);
      if (currentResult?.status === 'verified') return response.json(publicTournamentResult(currentResult));
      const currentMatch = await getTournamentMatchDocument(match.id, tournament.id);
      if (currentMatch.status === 'completed' && currentMatch.resultId === result.id) {
        const verifiedResult = { ...result, status: 'verified', verifiedBy: session.id, verifiedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        await persistTournamentResultDocument(verifiedResult);
        return response.json(publicTournamentResult(verifiedResult));
      }
      const officialMatch = { ...currentMatch, resultId: result.id };
      const winningTeam = await getTournamentTeamDocument(payload.winnerId, tournament.id);
      if (!winningTeam || winningTeam.status !== 'active') throw new Error('The verified winner team is unavailable and requires admin review.');
      let rankingIntegration;
      try {
        rankingIntegration = await awardTournamentRankingForVerifiedResult(tournament, result, winningTeam);
        void recordAuditEvent({ eventType: 'tournament_ranking_integration', action: 'tournament_ranking_integration', source: 'system', request, actor: session, target: match, success: true, newValue: rankingIntegration, reason: rankingIntegration.status === 'skipped' ? rankingIntegration.reason : 'Verified tournament result integrated with existing ranking scores.' });
      } catch (error) {
        rankingIntegrationFailure = true;
        void recordAuditEvent({ eventType: 'tournament_ranking_integration_failed', action: 'tournament_ranking_integration_failed', source: 'system', request, actor: session, target: match, success: false, reason: error.message, metadata: { resultId: result.id } });
        throw error;
      }
      const nextMatch = await advanceVerifiedMatchWinner(officialMatch, payload.winnerId);
      const standings = await updateTournamentStandingsForResult(tournament, officialMatch, payload.winnerId);
      const losingTeamId = officialMatch.participantA === payload.winnerId ? officialMatch.participantB : officialMatch.participantA;
      const losingTeam = await getTournamentTeamDocument(losingTeamId, tournament.id);
      if (!losingTeam || losingTeam.status !== 'active') throw new Error('The verified losing team is unavailable and requires admin review.');
      try {
        const achievementIntegration = await awardTournamentAchievementsForVerifiedResult(tournament, result, officialMatch, winningTeam, losingTeam, standings);
        void recordAuditEvent({ eventType: 'tournament_achievement_integration', action: 'tournament_achievement_integration', source: 'system', request, actor: session, target: match, success: true, newValue: achievementIntegration, reason: 'Verified tournament result integrated with existing member achievements.' });
      } catch (error) {
        void recordAuditEvent({ eventType: 'tournament_achievement_integration_failed', action: 'tournament_achievement_integration_failed', source: 'system', request, actor: session, target: match, success: false, reason: error.message, metadata: { resultId: result.id } });
        throw error;
      }
      const completedMatch = { ...officialMatch, status: 'completed', winnerId: payload.winnerId, updatedAt: new Date().toISOString() };
      await persistTournamentMatchDocument(completedMatch);
      const verifiedResult = { ...result, status: 'verified', verifiedBy: session.id, verifiedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await persistTournamentResultDocument(verifiedResult);
      if (!officialMatch.nextMatchId) {
        await persistTournamentDocument({ ...tournament, status: 'completed', updatedBy: session.id, updatedAt: new Date().toISOString() });
      }
      void recordAuditEvent({ eventType: 'tournament_result_verified', action: 'tournament_result_verified', source: 'admin', request, actor: session, target: match, previousValue: { resultId: result.id, status: result.status }, newValue: { resultId: verifiedResult.id, status: verifiedResult.status, winnerId: verifiedResult.winnerId, nextMatchId: nextMatch?.id || null }, reason: 'Authorized official match-result verification' });
      response.json(publicTournamentResult(verifiedResult));
    });
  } catch (error) {
    if (!rankingIntegrationFailure) await markMatchForReview(match, tournament, request, session, error.message);
    response.status(/cancelled|completed|conflicting|official next|higher score/.test(error.message) ? 409 : 400).json({ error: error.message });
  }
});

app.patch('/api/tournaments/:tournamentId/matches/:matchId/results/:resultId', async (request, response) => {
  const session = requirePermission(request, response, 'member.manage');
  if (!session) return;
  const tournament = await getTournamentDocument(request.params.tournamentId);
  if (!tournament) return response.status(404).json({ error: 'Tournament not found.' });
  const match = await getTournamentMatchDocument(request.params.matchId, tournament.id);
  if (!match) return response.status(404).json({ error: 'Tournament match not found.' });
  const result = await getTournamentResultDocument(request.params.resultId, tournament.id, match.id);
  if (!result) return response.status(404).json({ error: 'Tournament result not found.' });
  if (result.status !== 'pending') return response.status(409).json({ error: 'Official results cannot be edited. Submit a controlled correction workflow instead.' });
  try {
    const payload = validateMatchResultPayload(match, request.body);
    const corrected = { ...result, scoreA: payload.scoreA, scoreB: payload.scoreB, winnerId: payload.winnerId, correctionVersion: Number(result.correctionVersion || 0) + 1, updatedAt: new Date().toISOString() };
    await persistTournamentResultDocument(corrected);
    void recordAuditEvent({ eventType: 'tournament_result_corrected', action: 'tournament_result_corrected', source: 'admin', request, actor: session, target: match, previousValue: { resultId: result.id, scoreA: result.scoreA, scoreB: result.scoreB, winnerId: result.winnerId, correctionVersion: result.correctionVersion }, newValue: { resultId: corrected.id, scoreA: corrected.scoreA, scoreB: corrected.scoreB, winnerId: corrected.winnerId, correctionVersion: corrected.correctionVersion }, reason: 'Authorized correction of pending result' });
    response.json(publicTournamentResult(corrected));
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.get('/api/admin/rank-channel-config', async (request, response) => {
  const session = requirePermission(request, response, 'settings.manage');
  if (!session) return;
  try {
    response.json(await getRankChannelConfig());
  } catch (error) {
    response.status(502).json({ error: 'Rank channel settings are temporarily unavailable.' });
  }
});

app.patch('/api/admin/rank-channel-config', async (request, response) => {
  const session = requirePermission(request, response, 'settings.manage');
  if (!session) return;
  const candidate = request.body && typeof request.body === 'object' ? request.body : {};
  const includeAllChannels = candidate.includeAllChannels !== undefined ? Boolean(candidate.includeAllChannels) : undefined;
  const includedChannelIds = Array.isArray(candidate.includedChannelIds) ? candidate.includedChannelIds : undefined;
  const excludedChannelIds = Array.isArray(candidate.excludedChannelIds) ? candidate.excludedChannelIds : undefined;
  if (includeAllChannels === undefined && includedChannelIds === undefined && excludedChannelIds === undefined) {
    return response.status(400).json({ error: 'Provide channel rank settings to update.' });
  }
  try {
    const config = await saveRankChannelConfig({
      includeAllChannels: includeAllChannels ?? true,
      includedChannelIds: includedChannelIds ?? [],
      excludedChannelIds: excludedChannelIds ?? [],
      updatedBy: session.id,
    });
    response.json(config);
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.get('/api/members/:id/chat-rank', async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const targetId = String(request.params.id || '');
  if (!targetId) return response.status(400).json({ error: 'A member id is required.' });
  if (targetId !== session.id && !hasPermission(session, 'member.manage')) {
    return response.status(403).json({ error: 'Only the member or staff can view chat rank data.' });
  }
  try {
    const summary = await getMemberChatRankSummary(targetId);
    response.json(summary);
  } catch (error) {
    response.status(502).json({ error: 'Chat rank data is temporarily unavailable.' });
  }
});

app.get('/api/admin/audit-log', async (request, response) => {
  const session = requirePermission(request, response, 'settings.manage');
  if (!session) return;
  let parsed;
  try { parsed = auditQueryFromRequest(request); } catch (error) { return response.status(400).json({ error: error.message }); }
  try {
    const db = await getDatabase();
    if (db) {
      const collection = db.collection(auditLogsCollection);
      const [items, total] = await Promise.all([
        collection.find(parsed.query).sort({ timestamp: -1 }).skip((parsed.page - 1) * parsed.limit).limit(parsed.limit).toArray(),
        collection.countDocuments(parsed.query),
      ]);
      return response.json({ items, page: parsed.page, limit: parsed.limit, total, pages: Math.ceil(total / parsed.limit) });
    }
    const localItems = getLocalDocuments(auditLogsCollection).filter((event) => localAuditMatches(event, parsed.query)).sort((first, second) => second.timestamp.localeCompare(first.timestamp));
    const start = (parsed.page - 1) * parsed.limit;
    return response.json({ items: localItems.slice(start, start + parsed.limit), page: parsed.page, limit: parsed.limit, total: localItems.length, pages: Math.ceil(localItems.length / parsed.limit) });
  } catch (error) {
    console.error(`[audit] audit query failed: ${error.message}`);
    response.status(503).json({ error: 'Audit log is temporarily unavailable.' });
  }
});

app.get('/api/admin/audit-log/:id', async (request, response) => {
  const session = requirePermission(request, response, 'settings.manage');
  if (!session) return;
  if (!/^audit-[a-zA-Z0-9-]+$/.test(request.params.id)) return response.status(400).json({ error: 'Invalid audit event ID.' });
  const db = await getDatabase();
  const event = db
    ? await db.collection(auditLogsCollection).findOne({ id: request.params.id })
    : getLocalDocuments(auditLogsCollection).find((item) => item.id === request.params.id);
  if (!event) return response.status(404).json({ error: 'Audit event not found.' });
  response.json(event);
});

app.post('/api/admin/members/:id/unsuspend', async (request, response) => {
  const session = requirePermission(request, response, 'member.suspend');
  if (!session) return;
  const member = await findMemberById(request.params.id);
  if (!member) return response.status(404).json({ error: 'Member not found.' });
  if (member.status !== 'suspended') {
    securityLog('unsuspend_invalid_target', request, { actorMemberId: session.id, targetMemberId: request.params.id });
    return response.status(409).json({ error: 'Member is not suspended.' });
  }
  const restoredRole = ['admin', 'coadmin', 'moderator', 'member'].includes(member.suspendedFromRole) ? member.suspendedFromRole : 'member';
  try {
    const reconciled = await reconcileMember(member.discordId, { requestedRole: restoredRole, unsuspend: true, forceRecruitOutsideGuild: true });
    void recordAuditEvent({ eventType: 'member_unsuspended', action: 'member_unsuspended', source: 'admin', request, actor: session, target: member, previousValue: { status: 'suspended', role: 'recruit' }, newValue: { status: reconciled.status, role: reconciled.role }, reason: `Restored role: ${restoredRole}` });
    response.json({ member: publicMember(reconciled), unsuspended: true });
  } catch (error) {
    void recordAuditEvent({ eventType: 'member_unsuspended', action: 'member_unsuspended', source: 'admin', request, actor: session, target: member, success: false, reason: error.message });
    console.error(`[sync] Unsuspend reconciliation failed for ${member.discordId}: ${error.message}`);
    response.status(502).json({ error: `Member could not be unsuspended: ${error.message}` });
  }
});

app.post('/api/:resource', async (request, response) => {
  if (request.params.resource === 'tournament-participants') return response.status(405).json({ error: 'Use the tournament participant endpoints.' });
  const collectionName = collectionNames[request.params.resource];
  if (!collectionName) return response.status(404).json({ error: 'Unknown resource' });
  const document = { ...(request.body || {}) };
  delete document._id;
  if (!document.id) return response.status(400).json({ error: 'A stable id is required' });
  const session = requireSession(request, response);
  if (!session) return;
  if (request.params.resource === 'events' || request.params.resource === 'announcements' || request.params.resource === 'settings' || isRankingResource(request.params.resource)) {
    if (!hasPermission(session, 'member.manage')) {
      securityLog('forbidden_request', request, { memberId: session.id, permission: 'member.manage' });
      return response.status(403).json({ error: 'Admin or co-admin access required' });
    }
  }
  if (request.params.resource === 'members') {
    if (document.id !== session.id) {
      securityLog('member_create_denied', request, { memberId: session.id, targetId: document.id });
      return response.status(403).json({ error: 'You can only create or update your own member application.' });
    }
    const allowedApplicationFields = new Set(['id', 'freeFireUid', 'application', 'bio', 'character']);
    if (Object.keys(document).some((field) => !allowedApplicationFields.has(field))) {
      return response.status(403).json({ error: 'Member identity, role, status, ownership, and Discord fields are server-controlled.' });
    }
    document.role = 'recruit';
    document.status = 'pending';
    document.isOwner = false;
    document.discordId = session.discordId;
    document.displayName = session.displayName;
    document.discordName = session.discordName;
    document.avatar = session.avatar;
    document.isInDiscordGuild = session.isInDiscordGuild;
    const existingMember = await getDatabase().then((db) => db?.collection(collectionName).findOne({ id: session.id })).catch(() => null)
      || getLocalDocuments(collectionName).find((member) => member.id === session.id);
    if (existingMember) {
      Object.assign(document, existingMember, document);
      document.role = existingMember.role;
      document.status = existingMember.status;
      document.isOwner = existingMember.isOwner;
      document.discordId = existingMember.discordId;
      document.isInDiscordGuild = existingMember.isInDiscordGuild;
    }
  }
  if (request.params.resource === 'members' && document.application) {
    const settingsDb = await getDatabase();
    const settings = settingsDb
      ? await settingsDb.collection(collectionNames.settings).findOne({ id: 'guild' })
      : getLocalDocuments(collectionNames.settings).find((item) => item.id === 'guild');
    const application = document.application;
    if (settings?.strongVerification && (application.verificationMode !== 'strong' || !application.verificationCode || !application.verificationProofName)) {
      return response.status(400).json({ error: 'Stronger Free Fire verification requires a profile code and proof screenshot.' });
    }
    if (getFreeFireStatsConfig()) {
      try {
        const stats = await saveFreeFireStats(document.id, String(application.gameId).trim(), String(application.region || hlGamingRegion).toLowerCase());
        document.freeFireUid = stats.freeFireUid;
        document.stats = stats;
      } catch (error) {
        return response.status(502).json({ error: `Free Fire UID could not be verified: ${error.message}` });
      }
    }
  }
  if (isRankingScoreResource(request.params.resource)) {
    try {
      const db = await getResourceDatabase(request.params.resource);
      const existing = db
        ? await db.collection(collectionName).findOne({ id: document.id })
        : getLocalDocuments(collectionName).find((item) => item.id === document.id);
      if (existing) return response.status(409).json({ error: 'Ranking scores are immutable' });
    } catch (error) {
      console.warn(`Ranking score duplicate check unavailable: ${error.message}`);
    }
  }
  try {
    const db = await getResourceDatabase(request.params.resource);
    if (db) {
      if (isRankingScoreResource(request.params.resource)) await db.collection(collectionName).insertOne(document);
      else await db.collection(collectionName).replaceOne({ id: document.id }, document, { upsert: true });
    }
    else saveLocalDocument(collectionName, document);
    broadcastMemberUpdate(document);
    response.status(201).json(document);
  } catch (error) {
    console.warn(`MongoDB write unavailable, using local data: ${error.message}`);
    saveLocalDocument(collectionName, document);
    response.status(201).json(document);
  }
});

app.patch('/api/:resource/:id', async (request, response) => {
  if (request.params.resource === 'tournament-participants') return response.status(405).json({ error: 'Use the tournament participant endpoints.' });
  const collectionName = collectionNames[request.params.resource];
  if (!collectionName) return response.status(404).json({ error: 'Unknown resource' });
  const changes = { ...(request.body || {}) };
  delete changes._id;
  if (request.params.resource === 'members' && Object.prototype.hasOwnProperty.call(changes, 'hlGamingApiKey')) {
    return response.status(400).json({ error: 'Use the HL Gaming API key endpoint to validate and save this key.' });
  }
  const session = requireSession(request, response);
  if (!session) return;
  const isMemberResource = request.params.resource === 'members';
  const requestedRoleChange = isMemberResource && Object.prototype.hasOwnProperty.call(changes, 'role');
  const memberPersonalFields = new Set(['bio', 'freeFireUid', 'character']);
  if (isMemberResource && Object.keys(changes).some((field) => !memberPersonalFields.has(field) && !['role', 'status'].includes(field))) {
    securityLog('member_patch_denied', request, { memberId: session.id, reason: 'forbidden_field' });
    return response.status(403).json({ error: 'This member field is server-controlled.' });
  }
  if (isMemberResource && requestedRoleChange) {
    if (!await requireGuildOwner(request, response)) return;
  } else if (isMemberResource && Object.prototype.hasOwnProperty.call(changes, 'status')) {
    if (!hasPermission(session, 'member.suspend')) {
      securityLog('suspension_denied', request, { memberId: session.id, role: session.role });
      return response.status(403).json({ error: 'Admin or co-admin access required.' });
    }
  } else if (isMemberResource && request.params.id !== session.id) {
    securityLog('member_patch_denied', request, { memberId: session.id, targetId: request.params.id, reason: 'not_self' });
    return response.status(403).json({ error: 'You can only update your own profile.' });
  }
  let changesRole = requestedRoleChange;
  const changesStatus = Object.prototype.hasOwnProperty.call(changes, 'status');
  const changesAnnouncement = request.params.resource === 'announcements';
  const changesEvent = request.params.resource === 'events';
  const changesSettings = request.params.resource === 'settings';
  const changesRanking = isRankingResource(request.params.resource);
  if (isRankingScoreResource(request.params.resource)) return response.status(405).json({ error: 'Ranking scores are immutable' });
  if (changesRole && !['admin', 'coadmin', 'moderator', 'member', 'recruit'].includes(changes.role)) return response.status(400).json({ error: 'Invalid member role.' });
  if (changesStatus && !['pending', 'approved', 'rejected', 'suspended'].includes(changes.status)) return response.status(400).json({ error: 'Invalid member status.' });
  if ((changesAnnouncement || changesEvent || changesSettings || changesRanking) && !hasPermission(session, 'member.manage')) return response.status(403).json({ error: 'Admin or co-admin access required' });
  let existingMemberForAudit = null;
  try {
    const db = await getResourceDatabase(request.params.resource);
    const existingMember = request.params.resource === 'members'
      ? (db ? await db.collection(collectionName).findOne({ id: request.params.id }) : getLocalDocuments(collectionName).find((member) => member.id === request.params.id))
      : null;
    existingMemberForAudit = existingMember;
    if (request.params.resource === 'members' && !existingMember) return response.status(404).json({ error: 'Member not found.' });
    if (request.params.resource === 'members' && existingMember?.status === 'suspended' && changesRole) {
      securityLog('suspended_role_change_denied', request, { actorMemberId: session.id, targetMemberId: existingMember.id, requestedRole: changes.role });
      return response.status(409).json({ error: 'Unsuspend the member before changing their role.' });
    }
    if (request.params.resource === 'members' && existingMember?.status === 'suspended' && changes.status === 'approved') {
      securityLog('suspended_approval_denied', request, { actorMemberId: session.id, targetMemberId: existingMember.id });
      return response.status(409).json({ error: 'Use the explicit unsuspend action for suspended members.' });
    }
    if (request.params.resource === 'members' && changes.status === 'suspended' && existingMember) {
      if (existingMember.role !== 'recruit') changes.suspendedFromRole = existingMember.role;
      changes.role = 'recruit';
      changesRole = true;
      changes.suspendedAt = existingMember.suspendedAt || new Date().toISOString();
    }
    if (changesRole && request.params.resource === 'members' && roleMemberLimits[changes.role]) {
      const members = db
        ? await db.collection(collectionName).find({}).project({ id: 1, role: 1 }).toArray()
        : getLocalDocuments(collectionName);
      const assignedCount = members.filter((member) => member.id !== request.params.id && member.role === changes.role).length;
      if (assignedCount >= roleMemberLimits[changes.role]) {
        const roleNames = { admin: 'Guild Leader', coadmin: 'Acting Leader', moderator: 'Elder', member: 'Guild Member' };
        void recordAuditEvent({ eventType: 'role_capacity_rejected', action: 'role_capacity_rejected', source: 'admin', request, actor: session, target: existingMember, success: false, reason: `${roleNames[changes.role]} capacity reached`, newValue: { role: changes.role, limit: roleMemberLimits[changes.role] } });
        return response.status(409).json({ error: `${roleNames[changes.role]} can contain only ${roleMemberLimits[changes.role]} member${roleMemberLimits[changes.role] === 1 ? '' : 's'}. Remove or change an existing ${roleNames[changes.role].toLowerCase()} first.` });
      }
    }
    if (db) {
      const update = { $set: changes };
      if (changes.suspendedFromRole === null) update.$unset = { suspendedFromRole: '' };
      await db.collection(collectionName).updateOne({ id: request.params.id }, update);
    } else updateLocalDocument(collectionName, request.params.id, changes);
    if (isMemberResource && changes.status === 'suspended') {
      updateActiveMemberSessions(request.params.id, { status: 'suspended', role: 'recruit' });
      closeMemberSockets(request.params.id);
    } else if (isMemberResource && !changesRole) {
      updateActiveMemberSessions(request.params.id, changes);
    }
    if (request.params.resource === 'members' && changesRole && existingMember?.isInDiscordGuild === false) {
      const discordLeftAt = existingMember.discordLeftAt || new Date().toISOString();
      if (!existingMember.discordLeftAt) {
        if (db) await db.collection(collectionName).updateOne({ id: request.params.id }, { $set: { discordLeftAt } });
        else updateLocalDocument(collectionName, request.params.id, { discordLeftAt });
      }
      scheduleDiscordMemberCleanup(request.params.id, existingMember.discordId, discordLeftAt);
    }
    if (changesRole && request.params.resource === 'members') {
      const targetDiscordId = existingMember?.discordId || request.params.id.replace(/^discord_/, '');
      await reconcileMember(targetDiscordId, { requestedRole: changes.role, forceRecruitOutsideGuild: changes.status === 'approved' && existingMember?.status === 'suspended' });
      if (changes.status === 'suspended') void recordAuditEvent({ eventType: 'member_suspended', action: 'member_suspended', source: 'admin', request, actor: session, target: existingMember, previousValue: { role: existingMember.role, status: existingMember.status }, newValue: { role: 'recruit', status: 'suspended' }, reason: 'Administrative suspension' });
      if (existingMember && existingMember.role !== changes.role) void recordAuditEvent({ eventType: 'website_role_changed', action: 'website_role_changed', source: 'admin', request, actor: session, target: existingMember, previousValue: { role: existingMember.role }, newValue: { role: changes.role }, reason: 'Authorized website role change' });
    } else if (isMemberResource && changes.status === 'approved' && existingMember?.status !== 'suspended') {
      void recordAuditEvent({ eventType: 'member_approved', action: 'member_approved', source: 'admin', request, actor: session, target: existingMember, previousValue: { status: existingMember?.status }, newValue: { status: 'approved', role: changes.role || existingMember?.role } });
    }
    if (isMemberResource) {
      const updatedMember = await findMemberById(request.params.id);
      if (updatedMember) broadcastMemberUpdate(updatedMember);
    }
    response.json(publicMember({ id: request.params.id, ...changes }));
  } catch (error) {
    if (changesRole && error.message.includes('full')) {
      const roleNames = { admin: 'Guild Leader', coadmin: 'Acting Leader', moderator: 'Elder', member: 'Guild Member' };
      return response.status(409).json({ error: `${roleNames[changes.role]} can contain only ${roleMemberLimits[changes.role]} member${roleMemberLimits[changes.role] === 1 ? '' : 's'}. Remove or change an existing ${roleNames[changes.role].toLowerCase()} first.` });
    }
    if (changesRole) {
      securityLog('discord_role_sync_failed', request, { memberId: request.params.id, reason: error.message });
      if (changes.status === 'suspended') void recordAuditEvent({ eventType: 'member_suspended', action: 'member_suspended', source: 'admin', request, actor: session, target: existingMemberForAudit, success: false, reason: error.message });
      void recordAuditEvent({ eventType: 'discord_sync_failed', action: 'discord_sync_failed', source: 'admin', request, actor: session, target: existingMemberForAudit, success: false, reason: error.message, metadata: { synchronizationPending: true } });
      await persistReconciledMember(request.params.id, { discordSyncPending: true, discordSyncPendingAt: new Date().toISOString() });
      return response.status(502).json({ error: `Discord role synchronization failed: ${error.message}` });
    }
    console.warn(`MongoDB update unavailable, using local data: ${error.message}`);
    updateLocalDocument(collectionName, request.params.id, changes);
    response.json(publicMember({ id: request.params.id, ...changes }));
  }
});

app.delete('/api/:resource/:id', async (request, response) => {
  if (request.params.resource === 'tournament-participants') return response.status(405).json({ error: 'Tournament participant deletion is not supported.' });
  const collectionName = collectionNames[request.params.resource];
  if (!collectionName) return response.status(404).json({ error: 'Unknown resource' });
  if (request.params.resource === 'tournaments') return response.status(405).json({ error: 'Tournament deletion is not supported.' });
  if (isRankingScoreResource(request.params.resource)) return response.status(405).json({ error: 'Ranking scores cannot be deleted' });
  const session = requirePermission(request, response, 'member.manage');
  if (!session) return;
  try {
    const db = await getResourceDatabase(request.params.resource);
    if (request.params.resource === 'events') {
      const linkedTournament = db
        ? await db.collection(collectionNames.tournaments).findOne({ eventId: request.params.id }, { projection: { id: 1 } })
        : getLocalDocuments(collectionNames.tournaments).find((tournament) => tournament.eventId === request.params.id);
      if (linkedTournament) return response.status(409).json({ error: 'Events linked to tournaments cannot be deleted.' });
    }
    if (request.params.resource === 'members') {
      const target = db
        ? await db.collection(collectionName).findOne({ id: request.params.id })
        : getLocalDocuments(collectionName).find((member) => member.id === request.params.id);
      if (target?.discordId === session.discordId || target?.isOwner || target?.role === 'admin') {
        securityLog('member_delete_denied', request, { memberId: session.id, targetId: request.params.id, reason: 'protected_member' });
        return response.status(403).json({ error: 'The guild owner or protected admin cannot be deleted here.' });
      }
    }
    if (db) await db.collection(collectionName).deleteOne({ id: request.params.id });
    else removeLocalDocument(collectionName, request.params.id);
    response.status(204).end();
  } catch (error) {
    console.warn(`MongoDB delete unavailable, using local data: ${error.message}`);
    removeLocalDocument(collectionName, request.params.id);
    response.status(204).end();
  }
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`MongoDB API listening on port ${port}`);
  void refreshWeeklyFreeFireData();
  setInterval(() => void refreshWeeklyFreeFireData(), 60 * 1000);
});

process.on('SIGINT', async () => {
  discordBot?.destroy();
  webSocketServer.close();
  await mongoClient?.close();
  await rankingMongoClient?.close();
  await chatMongoClient?.close();
  process.exit(0);
});
