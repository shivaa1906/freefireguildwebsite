require('dotenv').config();
const express = require('express');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
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
};
const discordRoleIds = {};
const chatRoles = new Set(['admin', 'coadmin', 'moderator', 'member']);
const chatMessages = [];
let chatMessagesLoaded = false;
const webSocketSessions = new Map();
const groupMessageMaxAge = 24 * 60 * 60 * 1000;
const sessions = new Map();
const oauthStates = new Set();
const webSocketClients = new Set();
let lastWeeklyReportKey = null;
const discordBot = discordBotToken ? new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] }) : null;
const webSocketServer = new WebSocketServer({ server: httpServer, path: '/ws' });

webSocketServer.on('connection', async (socket, request) => {
  webSocketClients.add(socket);
  webSocketSessions.set(socket, request);
  const session = getSession(request);
  if (session) {
    await loadChatMessages();
    pruneExpiredGroupMessages();
    pruneExpiredMessages();
    const visibleMessages = chatMessages.filter((message) => (message.channel === 'group' && chatRoles.has(session.role)) || session.role === 'admin' || message.authorId === session.id || message.recipientId === session.id);
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
        socket.send(JSON.stringify({ type: 'presence', discordId, status, isOnline: status !== 'offline' }));
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
    const isLeader = session.role === 'admin';
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
    const isLeader = session.role === 'admin';
    const isParticipant = session.id === typingUser.authorId || session.id === typingUser.recipientId;
    if (typingUser.channel === 'group' || isLeader || isParticipant) {
      socket.send(JSON.stringify({ type: 'chat:typing', typingUser }));
    }
  }
}

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
    broadcast({ type: 'presence', discordId: presence.userId, status, isOnline });
    const guild = presence.guild;
    if (guild) {
      const onlineMembers = guild.members.cache.filter((member) => member.presence?.status && member.presence.status !== 'offline').size;
      broadcast({ type: 'guild:stats', totalMembers: guild.memberCount, onlineMembers });
    }
    try {
      const db = await getDatabase();
      await db?.collection(collectionNames.members).updateOne(
        { discordId: presence.userId },
        { $set: { presence: status, isOnline } },
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
let rankingDatabase;
let rankingMongoClient;
let chatDatabase;
let chatMongoClient;

async function getDatabase() {
  if (!mongoUrl) return null;
  if (!database) {
    mongoClient = new MongoClient(mongoUrl, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    await Promise.race([
      mongoClient.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('MongoDB connection timed out')), 5000)),
    ]);
    database = mongoClient.db(databaseName);
  }
  return database;
}

async function getRankingDatabase() {
  if (!rankingMongoUrl) return null;
  if (!rankingDatabase) {
    rankingMongoClient = new MongoClient(rankingMongoUrl, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
    await Promise.race([
      rankingMongoClient.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Ranking MongoDB connection timed out')), 5000)),
    ]);
    rankingDatabase = rankingMongoClient.db(rankingDatabaseName);
  }
  return rankingDatabase;
}

async function getChatDatabase() {
  if (!chatMongoUrl) return null;
  if (!chatDatabase) {
    chatMongoClient = new MongoClient(chatMongoUrl, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
    await Promise.race([
      chatMongoClient.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Chat MongoDB connection timed out')), 5000)),
    ]);
    chatDatabase = chatMongoClient.db(chatDatabaseName);
  }
  return chatDatabase;
}

async function loadChatMessages() {
  if (chatMessagesLoaded) return;
  try {
    const db = await getChatDatabase();
    const storedMessages = db
      ? await db.collection('chat_messages').find({}).sort({ createdAt: 1 }).limit(100).toArray()
      : getLocalDocuments('chat_messages');
    chatMessages.push(...storedMessages);
  } catch (error) {
    console.warn(`Chat MongoDB read unavailable, using local data: ${error.message}`);
    chatMessages.push(...getLocalDocuments('chat_messages'));
  }
  pruneExpiredMessages();
  chatMessagesLoaded = true;
}

async function persistChatMessage(message) {
  try {
    const db = await getChatDatabase();
    if (db) await db.collection('chat_messages').replaceOne({ id: message.id }, message, { upsert: true });
    else saveLocalDocument('chat_messages', message);
  } catch (error) {
    console.warn(`Chat MongoDB write unavailable, using local data: ${error.message}`);
    saveLocalDocument('chat_messages', message);
  }
}

async function updatePersistedChatMessage(message) {
  try {
    const db = await getChatDatabase();
    if (db) await db.collection('chat_messages').updateOne({ id: message.id }, { $set: { seenBy: message.seenBy || [] } });
    else saveLocalDocument('chat_messages', message);
  } catch (error) {
    console.warn(`Chat MongoDB seen update unavailable, using local data: ${error.message}`);
    saveLocalDocument('chat_messages', message);
  }
}

async function removePersistedChatMessage(id) {
  try {
    const db = await getChatDatabase();
    if (db) await db.collection('chat_messages').deleteOne({ id });
    else removeLocalDocument('chat_messages', id);
  } catch (error) {
    console.warn(`Chat MongoDB delete unavailable, using local data: ${error.message}`);
    removeLocalDocument('chat_messages', id);
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

function getSession(request) {
  const token = request.headers.cookie?.match(/guild_session=([^;]+)/)?.[1];
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

function setSession(response, member) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, member);
  const encodedMember = Buffer.from(JSON.stringify(member)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(encodedMember).digest('base64url');
  const cookieOptions = `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
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

function getDiscordRoleData(guildMember) {
  const isOwner = guildMember.guild.ownerId === guildMember.id;
  if (guildMember.roles.cache.has(discordRoleIds.admin)) return { role: 'admin', isOwner };
  if (guildMember.roles.cache.has(discordRoleIds.coadmin) || guildMember.roles.cache.has(discordCoadminRoleId)) return { role: 'coadmin', isOwner };
  if (guildMember.roles.cache.has(discordRoleIds.moderator)) return { role: 'moderator', isOwner };
  if (guildMember.roles.cache.has(discordRoleIds.member)) return { role: 'member', isOwner };
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
  if (discordRoleIds[role]) await guildMember.roles.add(discordRoleIds[role]);
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
    } else if (member.role !== role || member.isOwner !== isOwner || member.isInDiscordGuild !== isInDiscordGuild) {
      member = { ...member, role, status: isInDiscordGuild ? (role === 'recruit' ? member.status : 'approved') : 'pending', isOwner, isInDiscordGuild };
      await membersCollection?.updateOne({ id: member.id }, { $set: { role, status: member.status, isOwner, isInDiscordGuild } });
    } else if (member.discordDisplayName !== (profile.global_name || profile.username) || member.discordAvatar !== getProfileAvatar(profile)) {
      member = {
        ...member,
        discordDisplayName: profile.global_name || profile.username,
        discordAvatar: getProfileAvatar(profile),
      };
      await membersCollection?.updateOne({ id: member.id }, { $set: { discordDisplayName: member.discordDisplayName, discordAvatar: member.discordAvatar } });
    }
    if (member) {
      const refreshedProfile = {
        discordDisplayName: profile.global_name || profile.username,
        discordAvatar: getProfileAvatar(profile),
      };
      member = { ...member, ...refreshedProfile, presence, isOnline: presence !== 'offline' };
      await membersCollection?.updateOne({ id: member.id }, { $set: { ...refreshedProfile, presence, isOnline: presence !== 'offline' } });
    }
    setSession(response, member);
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
  if (discordRole) {
    const refreshedMember = {
      ...member,
      role: discordRole.role,
      isOwner: discordRole.isOwner,
      status: isInDiscordGuild ? (discordRole.role === 'recruit' ? member.status : 'approved') : 'pending',
      isInDiscordGuild,
      presence,
      isOnline: presence !== 'offline',
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
  const refreshedMember = { ...member, role: 'recruit', isOwner: false, status: 'pending', isInDiscordGuild, presence, isOnline: false };
  sessions.set(token, refreshedMember);
  response.json({ authenticated: true, member: refreshedMember });
});

app.post('/api/auth/logout', (request, response) => {
  const token = request.headers.cookie?.match(/guild_session=([^;]+)/)?.[1];
  if (token) sessions.delete(token);
  response.setHeader('Set-Cookie', ['guild_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0', 'guild_session_data=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0']);
  response.status(204).end();
});

app.get('/api/health', async (_request, response) => {
  try {
    const db = await getDatabase();
    response.json({ database: Boolean(db), status: 'ok' });
  } catch (_error) {
    response.status(503).json({ database: false, status: 'error' });
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
    if (!db) return response.json(getLocalDocuments(collectionName));
    const documents = await db.collection(collectionName).find({}).toArray();
    response.json(documents);
  } catch (error) {
    console.warn(`MongoDB read unavailable, using local data: ${error.message}`);
    response.json(getLocalDocuments(collectionName));
  }
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
  const session = requireSession(request, response);
  if (!session) return;
  const changesRole = Object.prototype.hasOwnProperty.call(changes, 'role');
  const changesStatus = Object.prototype.hasOwnProperty.call(changes, 'status');
  const changesAnnouncement = request.params.resource === 'announcements';
  const changesEvent = request.params.resource === 'events';
  const changesSettings = request.params.resource === 'settings';
  const changesRanking = isRankingResource(request.params.resource);
  if (isRankingScoreResource(request.params.resource)) return response.status(405).json({ error: 'Ranking scores are immutable' });
  if (changesRole && session.role !== 'admin') return response.status(403).json({ error: 'Only the guild owner can manage roles' });
  if (changesStatus && session.role !== 'admin' && session.role !== 'coadmin') return response.status(403).json({ error: 'Admin or co-admin access required' });
  if ((changesAnnouncement || changesEvent || changesSettings) && session.role !== 'admin' && session.role !== 'coadmin') return response.status(403).json({ error: 'Admin or co-admin access required' });
  if (changesRanking && session.role !== 'admin' && session.role !== 'coadmin') return response.status(403).json({ error: 'Admin or co-admin access required' });
  try {
    const db = await getResourceDatabase(request.params.resource);
    if (db) await db.collection(collectionName).updateOne({ id: request.params.id }, { $set: changes });
    else updateLocalDocument(collectionName, request.params.id, changes);
    if (changesRole && request.params.resource === 'members') {
      await syncDiscordRole(request.params.id.replace(/^discord_/, ''), changes.role);
    }
    response.json({ id: request.params.id, ...changes });
  } catch (error) {
    console.warn(`MongoDB update unavailable, using local data: ${error.message}`);
    updateLocalDocument(collectionName, request.params.id, changes);
    response.json({ id: request.params.id, ...changes });
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
});

process.on('SIGINT', async () => {
  discordBot?.destroy();
  webSocketServer.close();
  await mongoClient?.close();
  await rankingMongoClient?.close();
  await chatMongoClient?.close();
  process.exit(0);
});
