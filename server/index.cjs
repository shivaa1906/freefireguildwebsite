require('dotenv').config();
const express = require('express');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns');
const { MongoClient } = require('mongodb');
const crypto = require('node:crypto');
const { Client, GatewayIntentBits, Events, SlashCommandBuilder } = require('discord.js');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const httpServer = http.createServer(app);
const port = Number(process.env.PORT || process.env.API_PORT || 3001);
const mongoUrl = process.env.MONGODB_URI;
const rankingMongoUrl = process.env.RANKING_MONGODB_URI || process.env.MONGODB_URI_2;
const chatMongoUrl = process.env.CHAT_MONGODB_URI || process.env.MONGODB_URI_3;
const databaseName = process.env.MONGODB_DB || 'free_fire_guild';
const rankingDatabaseName = process.env.RANKING_MONGODB_DB || 'free_fire_rankings';
const chatDatabaseName = process.env.CHAT_MONGODB_DB || 'free_fire_chat';
const chatStorageLimitBytes = 10 * 1024 * 1024;
const envValue = (name) => {
  const value = process.env[name]?.trim();
  return value && value !== '...' && !value.startsWith('your_') ? value : undefined;
};
const hlGamingAccountApiUrl = process.env.HLGAMING_ACCOUNT_API_URL || 'https://proapis.hlgamingofficial.com/main/games/freefire/account/api';
const hlGamingStatsApiUrl = process.env.HLGAMING_STATS_API_URL || 'https://proapis.hlgamingofficial.com/main/games/freefire/stats/api';
const hlGamingUserUid = envValue('HLGAMING_USER_UID');
const hlGamingApiKey = envValue('HLGAMING_API_KEY');
const hlGamingGuildApiKey = envValue('HLGAMING_GUILD_API_KEY') || hlGamingApiKey;
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
const keylessRefreshIntervalMs = 14 * 24 * 60 * 60 * 1000;
const mongoDnsServers = (process.env.MONGODB_DNS_SERVERS || '1.1.1.1,8.8.8.8')
  .split(',')
  .map((server) => server.trim())
  .filter(Boolean);
if (mongoDnsServers.length > 0) dns.setServers(mongoDnsServers);
const localDataPath = process.env.LOCAL_DATA_PATH || path.join(__dirname, 'data.json');
const appUrl = process.env.APP_URL || 'http://localhost:5173';
const discordClientId = process.env.DISCORD_CLIENT_ID;
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET;
const sessionSecret = process.env.SESSION_SECRET || discordClientSecret || 'free-fire-guild-development-session';
const discordRedirectUri = process.env.DISCORD_REDIRECT_URI || `http://localhost:${port}/auth/discord/callback`;
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
const chatRoles = new Set(['admin', 'coadmin', 'moderator', 'member']);
const chatMessages = [];
let chatMessagesLoaded = false;
const webSocketSessions = new Map();
const groupMessageMaxAge = 24 * 60 * 60 * 1000;
const sessions = new Map();
const discordAccessTokens = new Map();
const oauthStates = new Set();
const webSocketClients = new Set();
let lastWeeklyReportKey = null;
let lastWeeklyStatsRefreshKey = null;
const discordBot = discordBotToken ? new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] }) : null;
const webSocketServer = new WebSocketServer({ server: httpServer, path: '/ws' });

webSocketServer.on('connection', async (socket, request) => {
  webSocketClients.add(socket);
  webSocketSessions.set(socket, request);
  const session = getSession(request);
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
    const visibleMessages = chatMessages.filter((message) => (message.channel === 'group' && chatRoles.has(session.role)) || session.role === 'admin' || session.role === 'coadmin' || message.authorId === session.id || message.recipientId === session.id);
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
    if (!currentSession) return;
    if (message.type === 'chat:refresh') {
      void loadChatMessages().then(() => {
        pruneExpiredGroupMessages();
        pruneExpiredMessages();
        const visibleMessages = chatMessages.filter((item) => (item.channel === 'group' && chatRoles.has(currentSession.role)) || currentSession.role === 'admin' || currentSession.role === 'coadmin' || item.authorId === currentSession.id || item.recipientId === currentSession.id);
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
    if (message.type === 'chat:dm' && typeof message.content === 'string' && typeof message.recipientId === 'string' && message.recipientId !== currentSession.id && (!message.attachment || message.attachment.type === 'image' || message.attachment.type === 'document')) {
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
    if (message.type === 'chat:typing' && typeof message.isTyping === 'boolean') {
      const typingUser = {
        authorId: currentSession.id,
        authorName: currentSession.displayName,
        channel: message.recipientId ? 'dm' : 'group',
        recipientId: message.recipientId,
        isTyping: message.isTyping,
      };
      sendChatTypingToParticipants(typingUser);
    }
    if (message.type === 'chat:delete' && typeof message.id === 'string' && (currentSession.role === 'admin' || currentSession.role === 'coadmin')) {
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

async function registerDiscordCommands(client) {
  if (!discordGuildId) return;
  const guild = await client.guilds.fetch(discordGuildId);
  await guild.commands.set([
    new SlashCommandBuilder()
      .setName('top')
      .setDescription('Show the top 10 guild members by ranking points')
      .toJSON(),
  ]);
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
    const isLeader = session.role === 'admin' || session.role === 'coadmin';
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
    const isLeader = session.role === 'admin' || session.role === 'coadmin';
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
  if (origin === appUrl || origin === 'http://localhost:5173') {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  }
  if (request.method === 'OPTIONS') {
    response.sendStatus(204);
    return;
  }
  next();
});
app.use(express.json({ limit: '10mb' }));

if (discordBot) {
  discordBot.once(Events.ClientReady, async (client) => {
    console.log(`Discord bot online as ${client.user.tag}`);
    await ensureDiscordRoles().catch((error) => console.error('Discord role setup failed:', error.message));
    await registerDiscordCommands(client).catch((error) => console.error('Discord command registration failed:', error.message));
    if (discordGuildId && !client.guilds.cache.has(discordGuildId)) {
      console.warn(`Discord bot is not connected to guild ${discordGuildId}`);
    }
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
    try {
      const db = await getDatabase();
      const member = await db?.collection(collectionNames.members).findOne({ discordId: message.author.id, status: 'approved' }, { projection: { id: 1 } });
      if (member?.id) void awardAutomaticScore('discord-message', member.id);
    } catch (error) {
      console.warn(`Discord message ranking check failed: ${error.message}`);
    }
  });
  discordBot.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'top') return;
    await interaction.deferReply();
    try {
      const rankings = await getTopRankedMembers();
      await interaction.editReply(formatRankingReport(rankings, 'ALL-TIME TOP 10 RANKED MEMBERS'));
    } catch (error) {
      console.warn(`Discord ranking command failed: ${error.message}`);
      await interaction.editReply('Ranking data is temporarily unavailable.');
    }
  });
  discordBot.on(Events.GuildMemberUpdate, async (_oldMember, guildMember) => {
    if (guildMember.guild.id !== discordGuildId) return;
    const roleData = getDiscordRoleData(guildMember);
    broadcast({ type: 'role', discordId: guildMember.id, ...roleData });
    broadcast({ type: 'profile', discordId: guildMember.id, ...getDiscordProfileData(guildMember) });
    for (const [token, session] of sessions.entries()) {
      if (session.discordId !== guildMember.id) continue;
      sessions.set(token, {
        ...session,
        role: roleData.role,
        isOwner: roleData.isOwner,
        status: roleData.role === 'recruit' ? session.status : 'approved',
      });
    }
    try {
      const db = await getDatabase();
      const profileData = getDiscordProfileData(guildMember);
      await db?.collection(collectionNames.members).updateOne(
        { discordId: guildMember.id },
        { $set: { ...profileData, role: roleData.role, isOwner: roleData.isOwner, ...(roleData.role === 'recruit' ? {} : { status: 'approved' }) } },
      );
    } catch (_error) {
      // Role updates still reach connected clients immediately through WebSocket.
    }
  });
  discordBot.on(Events.Error, (error) => console.error('Discord bot error:', error.message));
  discordBot.login(discordBotToken).catch((error) => console.error('Discord bot login failed:', error.message));
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

async function getDatabase() {
  if (!mongoUrl) return null;
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
      return null;
    }
    database = mongoClient.db(databaseName);
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
  announcements: 'announcements',
  settings: 'settings',
  'ranking-tasks': 'ranking_tasks',
  'ranking-scores': 'ranking_scores',
};
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
    fetch(hlGamingStatsApiUrl, requestOptions({ uid, region: region.toUpperCase(), useruid: hlGamingUserUid, api: apiKey })),
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
      fetchGuildProfile(ownerUid, region, websiteRoleKeys.guildLeader || hlGamingGuildApiKey),
      fetchFreeFireStats(ownerUid, region, websiteRoleKeys.guildLeader || hlGamingGuildApiKey),
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
  const documents = getLocalDocuments(collectionName);
  const index = documents.findIndex((item) => item.id === document.id);
  if (index === -1) documents.push(document);
  else documents[index] = document;
  localStore[collectionName] = documents;
  writeLocalStore();
}

function updateLocalDocument(collectionName, id, changes) {
  const documents = getLocalDocuments(collectionName);
  const index = documents.findIndex((item) => item.id === id);
  if (index === -1) return false;
  documents[index] = { ...documents[index], ...changes };
  localStore[collectionName] = documents;
  writeLocalStore();
  return true;
}

function removeLocalDocument(collectionName, id) {
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

function getSession(request) {
  const token = getSessionToken(request);
  const activeSession = token ? sessions.get(token) : null;
  if (activeSession) return activeSession;
  const stored = request.headers.cookie?.match(/guild_session_data=([^;]+)/)?.[1];
  if (!stored) return null;
  const [encodedMember, signature] = stored.split('.');
  if (!encodedMember || !signature) return null;
  const expectedSignature = crypto.createHmac('sha256', sessionSecret).update(encodedMember).digest('base64url');
  if (signature !== expectedSignature) return null;
  try {
    const member = JSON.parse(Buffer.from(encodedMember, 'base64url').toString('utf8'));
    if (token) sessions.set(token, member);
    return member;
  } catch (_error) {
    return null;
  }
}

function setSession(response, member, discordToken) {
  const safeMember = publicMember(member);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, safeMember);
  if (discordToken) discordAccessTokens.set(token, discordToken);
  const encodedMember = Buffer.from(JSON.stringify(safeMember)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(encodedMember).digest('base64url');
  const cookieOptions = `${process.env.NODE_ENV === 'production' ? 'HttpOnly; SameSite=None; Secure' : 'HttpOnly; SameSite=Lax'}; Path=/; Max-Age=604800`;
  response.setHeader('Set-Cookie', [`guild_session=${token}; ${cookieOptions}`, `guild_session_data=${encodedMember}.${signature}; ${cookieOptions}`]);
}

function requireSession(request, response) {
  const session = getSession(request);
  if (!session) {
    response.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return session;
}

function requireStaff(request, response) {
  const session = requireSession(request, response);
  if (!session) return null;
  if (session.role !== 'admin' && session.role !== 'coadmin') {
    response.status(403).json({ error: 'Admin or co-admin access required' });
    return null;
  }
  return session;
}

async function getDiscordGuildRole(discordUserId) {
  if (!discordBotToken || !discordGuildId) return null;
  const guild = discordBot?.guilds.cache.get(discordGuildId);
  if (!guild) return null;
  const guildMember = await guild.members.fetch(discordUserId).catch(() => null);
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

async function syncDiscordRole(discordUserId, role) {
  if (!discordBot || !discordGuildId) return;
  const guild = discordBot.guilds.cache.get(discordGuildId);
  if (!guild) return;
  const guildMember = await guild.members.fetch(discordUserId).catch(() => null);
  if (!guildMember) return;
  const managedRoleIds = Object.values(discordRoleIds).filter(Boolean);
  await guildMember.roles.remove(managedRoleIds);
  const discordRole = role === 'recruit' ? discordRoleIds.members : discordRoleIds[role];
  if (discordRole) await guildMember.roles.add(discordRole);
}

async function isDiscordGuildMember(discordUserId) {
  if (!discordBotToken || !discordGuildId) return true;
  try {
    const response = await fetch(`https://discord.com/api/guilds/${discordGuildId}/members/${discordUserId}`, {
      headers: { Authorization: `Bot ${discordBotToken}` },
    });
    if (response.status === 404) return false;
    if (!response.ok) return false;
    return true;
  } catch (error) {
    console.warn(`Discord membership check unavailable: ${error.message}`);
    return false;
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
  oauthStates.add(state);
  const params = new URLSearchParams({ client_id: discordClientId, response_type: 'code', redirect_uri: discordRedirectUri, scope: 'identify', state });
  response.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

app.get('/auth/discord/callback', async (request, response) => {
  const { code, error, state } = request.query;
  if (error || !code || !state || !oauthStates.delete(state)) return response.redirect(`${appUrl}/?auth_error=discord_cancelled`);
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
        status: role === 'admin' || role === 'coadmin' ? 'approved' : 'pending',
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
      member = { ...member, role: syncedRole, status: isInDiscordGuild ? (role === 'recruit' ? member.status : 'approved') : 'pending', isOwner, isInDiscordGuild };
      await membersCollection?.updateOne({ id: member.id }, { $set: { role: syncedRole, status: member.status, isOwner, isInDiscordGuild } });
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
    setSession(response, member, token);
    response.redirect(`${appUrl}/?auth=success`);
  } catch (oauthError) {
    console.error('Discord OAuth error:', oauthError.message);
    response.redirect(`${appUrl}/?auth_error=discord_failed`);
  }
});

app.get('/api/auth/me', async (request, response) => {
  const token = request.headers.cookie?.match(/guild_session=([^;]+)/)?.[1];
  const member = token ? sessions.get(token) : null;
  if (!member) return response.status(401).json({ authenticated: false });
  const isInDiscordGuild = await isDiscordGuildMember(member.discordId);
  const discordRole = isInDiscordGuild ? await getDiscordGuildRole(member.discordId) : null;
  const discordGuild = discordBot?.guilds.cache.get(discordGuildId);
  const discordGuildMember = isInDiscordGuild && discordGuild ? await discordGuild.members.fetch(member.discordId).catch(() => null) : null;
  const presence = discordGuildMember?.presence?.status || 'offline';
  const hasHlGamingApiKey = Boolean((await getStoredHlGamingKey(member.id))?.apiKeyEncrypted);
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
  if (token) {
    sessions.delete(token);
    discordAccessTokens.delete(token);
  }
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

app.get('/api/guild-profile', async (request, response) => {
  const session = requireSession(request, response);
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
    response.json(profile);
  } catch (error) {
    response.status(502).json({ error: error.message });
  }
});

app.post('/api/guild-profile/refresh', async (request, response) => {
  const session = requireStaff(request, response);
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
      guildProfile = await fetchGuildProfile(uid, region, hlGamingGuildApiKey);
    } catch (error) {
      refreshErrors.push(`Guild profile: ${error.message}`);
    }
    try {
      ownerStats = await fetchFreeFireStats(uid, region, hlGamingGuildApiKey);
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

app.get('/api/:resource', async (request, response) => {
  const collectionName = collectionNames[request.params.resource];
  if (!collectionName) return response.status(404).json({ error: 'Unknown resource' });
  if (isRankingResource(request.params.resource)) {
    const session = requireSession(request, response);
    if (!session) return;
    if (!chatRoles.has(session.role)) return response.status(403).json({ error: 'Guild member access required' });
  }
  try {
    const db = await getResourceDatabase(request.params.resource);
    if (!db) return response.json(request.params.resource === 'members' ? await Promise.all(getLocalDocuments(collectionName).map(publicMemberWithKey)) : getLocalDocuments(collectionName));
    const documents = await db.collection(collectionName).find({}).toArray();
    response.json(request.params.resource === 'members' ? await Promise.all(documents.map(publicMemberWithKey)) : documents);
  } catch (error) {
    console.warn(`MongoDB read unavailable, using local data: ${error.message}`);
    response.json(getLocalDocuments(collectionName));
  }
});

app.post('/api/members/:id/free-fire-stats', async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  if (request.params.id !== session.id && session.role !== 'admin' && session.role !== 'coadmin') return response.status(403).json({ error: 'Only the member or guild staff can refresh Free Fire stats.' });
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
  const session = requireSession(request, response);
  if (!session) return;
  if (request.params.id !== session.id && session.role !== 'admin' && session.role !== 'coadmin') return response.status(403).json({ error: 'You can only manage your own HL Gaming API key.' });
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
  if (!requireStaff(request, response)) return;
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
      guildLeader: { configured: Boolean(hlGamingGuildApiKey), key: maskApiKey(hlGamingGuildApiKey), source: 'HLGAMING_GUILD_API_KEY' },
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
  if (!requireStaff(request, response)) return;
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
  if (!requireStaff(request, response)) return;
  if (!Object.prototype.hasOwnProperty.call(defaultRoleKeySettings, request.params.role)) return response.status(400).json({ error: 'Select a valid guild role.' });
  const rankingDb = await getRankingDatabase();
  if (!rankingDb) return response.status(503).json({ error: 'Ranking database is unavailable.' });
  await rankingDb.collection(hlGamingConfigCollection).updateOne({ id: 'settings' }, { $unset: { [`roleApiKeys.${request.params.role}`]: '' }, $set: { updatedAt: new Date().toISOString() } });
  response.status(204).end();
});

app.patch('/api/admin/hl-gaming-config', async (request, response) => {
  if (!requireStaff(request, response)) return;
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
  if (!requireStaff(request, response)) return;
  const rankingDb = await getRankingDatabase();
  if (!rankingDb) return response.status(503).json({ error: 'Ranking database is unavailable.' });
  await rankingDb.collection(hlGamingKeysCollection).deleteOne({ memberId: request.params.memberId });
  response.status(204).end();
});

app.post('/api/admin/hl-gaming-key-reminder/:memberId', async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  if (session.role !== 'admin' && session.role !== 'coadmin') return response.status(403).json({ error: 'Admin or co-admin access required.' });
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

app.post('/api/:resource', async (request, response) => {
  const collectionName = collectionNames[request.params.resource];
  if (!collectionName) return response.status(404).json({ error: 'Unknown resource' });
  const document = { ...(request.body || {}) };
  delete document._id;
  if (!document.id) return response.status(400).json({ error: 'A stable id is required' });
  const session = requireSession(request, response);
  if (!session) return;
  if (request.params.resource === 'events' || request.params.resource === 'announcements' || request.params.resource === 'settings' || isRankingResource(request.params.resource)) {
    if (session.role !== 'admin' && session.role !== 'coadmin') return response.status(403).json({ error: 'Admin or co-admin access required' });
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
    response.status(201).json(document);
  } catch (error) {
    console.warn(`MongoDB write unavailable, using local data: ${error.message}`);
    saveLocalDocument(collectionName, document);
    response.status(201).json(document);
  }
});

app.patch('/api/:resource/:id', async (request, response) => {
  const collectionName = collectionNames[request.params.resource];
  if (!collectionName) return response.status(404).json({ error: 'Unknown resource' });
  const changes = { ...(request.body || {}) };
  delete changes._id;
  if (request.params.resource === 'members' && Object.prototype.hasOwnProperty.call(changes, 'hlGamingApiKey')) {
    return response.status(400).json({ error: 'Use the HL Gaming API key endpoint to validate and save this key.' });
  }
  const session = requireSession(request, response);
  if (!session) return;
  if (request.params.resource === 'members' && request.params.id === session.id && ('bio' in changes || 'stats' in changes)) {
    return response.status(403).json({ error: 'Only the Free Fire UID can be edited from the member profile.' });
  }
  const changesRole = Object.prototype.hasOwnProperty.call(changes, 'role');
  const changesStatus = Object.prototype.hasOwnProperty.call(changes, 'status');
  const changesAnnouncement = request.params.resource === 'announcements';
  const changesEvent = request.params.resource === 'events';
  const changesSettings = request.params.resource === 'settings';
  const changesRanking = isRankingResource(request.params.resource);
  if (isRankingScoreResource(request.params.resource)) return response.status(405).json({ error: 'Ranking scores are immutable' });
  if (changesRole && session.role !== 'admin') return response.status(403).json({ error: 'Only the guild owner can manage roles' });
  if (changesRole && !['admin', 'coadmin', 'moderator', 'member', 'recruit'].includes(changes.role)) return response.status(400).json({ error: 'Invalid member role.' });
  if (changesStatus && session.role !== 'admin' && session.role !== 'coadmin') return response.status(403).json({ error: 'Admin or co-admin access required' });
  if ((changesAnnouncement || changesEvent || changesSettings) && session.role !== 'admin' && session.role !== 'coadmin') return response.status(403).json({ error: 'Admin or co-admin access required' });
  if (changesRanking && session.role !== 'admin' && session.role !== 'coadmin') return response.status(403).json({ error: 'Admin or co-admin access required' });
  try {
    const db = await getResourceDatabase(request.params.resource);
    if (changesRole && request.params.resource === 'members' && roleMemberLimits[changes.role]) {
      const members = db
        ? await db.collection(collectionName).find({}).project({ id: 1, role: 1 }).toArray()
        : getLocalDocuments(collectionName);
      const assignedCount = members.filter((member) => member.id !== request.params.id && member.role === changes.role).length;
      if (assignedCount >= roleMemberLimits[changes.role]) {
        const roleNames = { admin: 'Guild Leader', coadmin: 'Acting Leader', moderator: 'Elder', member: 'Guild Member' };
        return response.status(409).json({ error: `${roleNames[changes.role]} can contain only ${roleMemberLimits[changes.role]} member${roleMemberLimits[changes.role] === 1 ? '' : 's'}. Remove or change an existing ${roleNames[changes.role].toLowerCase()} first.` });
      }
    }
    if (db) await db.collection(collectionName).updateOne({ id: request.params.id }, { $set: changes });
    else updateLocalDocument(collectionName, request.params.id, changes);
    if (changesRole && request.params.resource === 'members') {
      await syncDiscordRole(request.params.id.replace(/^discord_/, ''), changes.role);
    }
    response.json(publicMember({ id: request.params.id, ...changes }));
  } catch (error) {
    console.warn(`MongoDB update unavailable, using local data: ${error.message}`);
    updateLocalDocument(collectionName, request.params.id, changes);
    response.json(publicMember({ id: request.params.id, ...changes }));
  }
});

app.delete('/api/:resource/:id', async (request, response) => {
  const collectionName = collectionNames[request.params.resource];
  if (!collectionName) return response.status(404).json({ error: 'Unknown resource' });
  if (isRankingScoreResource(request.params.resource)) return response.status(405).json({ error: 'Ranking scores cannot be deleted' });
  if (!requireStaff(request, response)) return;
  try {
    const db = await getResourceDatabase(request.params.resource);
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
