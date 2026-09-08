import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Trash2, ChevronDown, Copy, CornerUpLeft, Forward, Pin, Star, Smile, Plus, X, ExternalLink, Camera, Bell, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { CHAT_ROLES, ROLE_LABELS } from '@/types';
import { GridBackground, ParticleField, Vignette } from '@/components/effects/VisualEffects';

export function ChatPage() {
  const { member, members, chatMessages, typingUsers, sendChatMessage, sendChatTyping, markChatMessagesSeen, deleteChatMessage, notificationPermission, requestNotifications, unreadChatCount, guildSettings } = useAuth();
  const [draft, setDraft] = useState('');
  const [channelOpen, setChannelOpen] = useState(false);
  const [activeChannel, setActiveChannel] = useState<'group' | 'dm'>('group');
  const [selectedDmId, setSelectedDmId] = useState<string | null>(null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showAttachmentPicker, setShowAttachmentPicker] = useState(false);
  const [pendingCameraImage, setPendingCameraImage] = useState<{ name: string; dataUrl: string } | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [showDmReminder, setShowDmReminder] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const canChat = Boolean(member && CHAT_ROLES.includes(member.role));
  const canDelete = member?.role === 'admin' || member?.role === 'coadmin';
  const dmMembers = members.filter((item) => item.id !== member?.id && item.status !== 'rejected' && item.status !== 'suspended');
  const selectedDm = dmMembers.find((item) => item.id === selectedDmId);
  const groupViewerIds = members
    .filter((item) => item.id !== member?.id && item.status === 'approved' && CHAT_ROLES.includes(item.role))
    .map((item) => item.id);
  const visibleMessages = chatMessages.filter((message) => {
    const isExpiredMessage = now - Date.parse(message.createdAt) >= 24 * 60 * 60 * 1000;
    if (isExpiredMessage) return false;
    if (activeChannel === 'group') return message.channel === 'group';
    return message.channel === 'dm' && Boolean(selectedDm && ((message.authorId === member?.id && message.recipientId === selectedDm.id) || (message.authorId === selectedDm.id && message.recipientId === member?.id)));
  });
  const recentDmMembers = dmMembers
    .filter((item) => chatMessages.some((message) => isRecentDirectMessage(message, item.id, member?.id, now)))
    .sort((first, second) => getLatestDirectMessage(second.id, member?.id, chatMessages)?.createdAt.localeCompare(getLatestDirectMessage(first.id, member?.id, chatMessages)?.createdAt || '') || 0);
  const visibleTypingUsers = typingUsers.filter((typingUser) => {
    if (typingUser.authorId === member?.id) return false;
    if (activeChannel === 'group') return typingUser.channel === 'group';
    return typingUser.channel === 'dm' && Boolean(selectedDm && ((typingUser.authorId === selectedDm.id && typingUser.recipientId === member?.id) || (typingUser.authorId === member?.id && typingUser.recipientId === selectedDm.id)));
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleMessages.length, activeChannel, selectedDmId]);

  useEffect(() => {
    const incomingIds = visibleMessages.filter((message) => message.authorId !== member?.id).map((message) => message.id);
    markChatMessagesSeen(incomingIds);
  }, [visibleMessages.length, activeChannel, selectedDmId, member?.id, markChatMessagesSeen]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setShowDmReminder(false);
    if (activeChannel !== 'dm' || !selectedDm) return;
    const timer = window.setTimeout(() => setShowDmReminder(true), 120_000);
    return () => window.clearTimeout(timer);
  }, [activeChannel, selectedDmId]);

  const submitMessage = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || (activeChannel === 'dm' && !selectedDm)) return;
    sendChatMessage(draft, activeChannel === 'dm' ? selectedDm?.id : undefined);
    sendChatTyping(false, activeChannel === 'dm' ? selectedDm?.id : undefined);
    setDraft('');
  };

  const updateDraft = (value: string) => {
    setDraft(value);
    sendChatTyping(value.trim().length > 0, activeChannel === 'dm' ? selectedDm?.id : undefined);
  };

  const handleAttachment = (file: File | undefined, previewImage = false) => {
    if (!file || (activeChannel === 'dm' && !selectedDm) || file.size > 5 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      const type = file.type.startsWith('image/') ? 'image' : 'document';
      if (previewImage && type === 'image') {
        setPendingCameraImage({ name: file.name, dataUrl: String(reader.result) });
        setShowAttachmentPicker(false);
        return;
      }
      sendChatMessage('', activeChannel === 'dm' ? selectedDm?.id : undefined, { type, name: file.name, dataUrl: String(reader.result) });
      setShowAttachmentPicker(false);
    };
    reader.readAsDataURL(file);
  };

  const sendPendingCameraImage = () => {
    if (!pendingCameraImage || (activeChannel === 'dm' && !selectedDm)) return;
    sendChatMessage(draft.trim(), activeChannel === 'dm' ? selectedDm?.id : undefined, { type: 'image', ...pendingCameraImage });
    sendChatTyping(false, activeChannel === 'dm' ? selectedDm?.id : undefined);
    setDraft('');
    setPendingCameraImage(null);
  };

  const startLongPress = (id: string) => {
    longPressTimer.current = setTimeout(() => setOpenMenuId(id), 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const copyMessage = async (content: string) => {
    await navigator.clipboard?.writeText(content);
    setOpenMenuId(null);
  };

  const replyToMessage = (content: string) => {
    setDraft(`> ${content}\n`);
    setOpenMenuId(null);
  };

  const toggleStar = (id: string) => {
    setStarredIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setOpenMenuId(null);
  };

  const hasBeenSeenByEveryone = (message: typeof visibleMessages[number]) => {
    if (message.authorId !== member?.id) return false;
    if (message.channel === 'group') {
      return groupViewerIds.length > 0 && groupViewerIds.every((id) => message.seenBy?.includes(id));
    }
    return Boolean(message.recipientId && message.seenBy?.includes(message.recipientId));
  };

  if (!member) return null;

  return (
    <div className="min-h-screen bg-ink-900 relative overflow-hidden pt-16">
      <GridBackground />
      <ParticleField count={30} />
      <Vignette />

      <div className="relative z-10 px-4 md:px-8 py-8">
        <div className={`${channelOpen ? 'max-w-6xl' : 'max-w-4xl'} mx-auto transition-all duration-300`}>
          <div className="mb-8 animate-fade-in-down">
            <div className="hud-label mb-1">GUILD NETWORK · SECURE CHANNEL</div>
            <h1 className="section-title text-3xl md:text-4xl">Guild Chat</h1>
          </div>

          <div className="glass-panel clip-tactical-lg relative min-w-0 min-h-[calc(100vh-8rem)] p-4 md:p-6 animate-fade-in-up" onClick={() => { if (showAttachmentPicker) setShowAttachmentPicker(false); }}>
            <div className="flex items-center justify-between gap-4 px-2 pb-5 border-b border-tactical-700/30">
              <div className="flex items-center gap-2"><h2 className="font-display font-bold text-white uppercase tracking-wider">Chat Area</h2>{unreadChatCount > 0 && <span className="rounded-full bg-alert-500 px-2 py-0.5 font-mono text-[10px] text-white">{unreadChatCount > 99 ? '99+' : unreadChatCount} new</span>}</div>
              <div className="flex items-center gap-3">
                {notificationPermission === 'default' && <button onClick={() => void requestNotifications()} className="inline-flex items-center gap-1 font-mono text-[10px] text-neon-300 uppercase hover:text-neon-200" title="Enable private message notifications"><Bell size={13} /> Enable alerts</button>}
                {notificationPermission === 'denied' && <span className="inline-flex items-center gap-1 font-mono text-[10px] text-alert-400 uppercase" title="Allow notifications in browser settings"><Bell size={13} /> Alerts blocked</span>}
                <span className="font-mono text-[10px] text-success-400 uppercase">Live</span>
              </div>
            </div>
            {canChat && !channelOpen && <button onClick={() => { setActiveChannel('group'); setChannelOpen(true); }} className="flex w-full items-center gap-3 py-4 border-b border-tactical-700/30 text-left hover:bg-ink-800/30 transition-colors">
              <div className="w-10 h-10 flex items-center justify-center bg-neon-500/10 border border-neon-500/30">
                <MessageCircle size={20} className="text-neon-400" />
              </div>
              <div>
                <h2 className="font-heading font-bold text-white uppercase tracking-wider">Guild Channel</h2>
                <p className="font-mono text-[10px] text-tactical-300 uppercase">All four guild roles</p>
              </div>
            </button>}

            {recentDmMembers.length > 0 && !channelOpen && <div className="border-b border-tactical-700/30 py-3">
              <div className="px-2 pb-2 font-mono text-[10px] text-tactical-300 uppercase tracking-widest">Recent direct messages</div>
              {recentDmMembers.map((item) => {
                const latestMessage = getLatestDirectMessage(item.id, member?.id, chatMessages);
                const unreadMessages = chatMessages.filter((message) => isRecentDirectMessage(message, item.id, member?.id, now) && message.authorId !== member?.id && !message.seenBy?.includes(member?.id || '')).length;
                return <button key={item.id} onClick={() => { setSelectedDmId(item.id); setActiveChannel('dm'); setChannelOpen(true); }} className="flex w-full items-center gap-3 px-2 py-3 text-left hover:bg-ink-800/30 transition-colors">
                  <MessageAvatar member={item} name={item.displayName} />
                  <div className="min-w-0 flex-1"><div className="font-heading font-bold text-white truncate">{item.displayName}</div><div className="font-mono text-[10px] text-gray-500 truncate">{latestMessage?.content || 'Sent an attachment'}</div></div>
                  {unreadMessages > 0 && <span className="rounded-full bg-alert-500 px-2 py-0.5 font-mono text-[10px] text-white">{unreadMessages > 99 ? '99+' : unreadMessages}</span>}
                </button>;
              })}
            </div>}

            {!channelOpen && <div className="absolute bottom-5 right-5 z-20">
              <button onClick={() => setShowMemberPicker((open) => !open)} className="flex h-10 w-10 items-center justify-center rounded-full bg-neon-500 text-ink-900 shadow-lg hover:bg-neon-400" aria-label="Start a direct message" title="Start a direct message">
                <Plus size={20} />
              </button>
            </div>}

            {showMemberPicker && (
              <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowMemberPicker(false)}>
                <div className="absolute inset-0 bg-ink-900/80 backdrop-blur-sm" />
                <div className="relative glass-panel clip-tactical-lg w-full max-w-md max-h-[80vh] overflow-y-auto p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-display font-bold text-white uppercase tracking-wider">Members</h2>
                      <p className="font-mono text-[10px] text-tactical-300 uppercase">Choose someone to message</p>
                    </div>
                    <button onClick={() => setShowMemberPicker(false)} className="p-2 text-gray-500 hover:text-white" aria-label="Close member list"><X size={18} /></button>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto space-y-1 pr-1 scroll-smooth">
                    {dmMembers.map((item) => (
                      <button key={item.id} onClick={() => { setSelectedDmId(item.id); setActiveChannel('dm'); setChannelOpen(true); setShowMemberPicker(false); }} className="flex w-full items-center gap-3 p-3 text-left hover:bg-ink-800/60 transition-colors">
                        <MessageAvatar member={item} name={item.displayName} />
                        <div className="min-w-0 flex-1">
                          <div className="font-heading font-bold text-white truncate">{item.displayName}</div>
                          <div className="font-mono text-[10px] text-neon-400 uppercase">{ROLE_LABELS[item.role]}</div>
                        </div>
                        <span className="font-mono text-[10px] text-gray-500 uppercase">Message</span>
                      </button>
                    ))}
                    {dmMembers.length === 0 && <div className="py-8 text-center font-mono text-xs text-gray-500 uppercase">No members available</div>}
                  </div>
                </div>
              </div>
            )}

            {channelOpen && <>
            <button type="button" onClick={() => { setChannelOpen(false); setShowDmReminder(false); }} className="mb-3 inline-flex items-center gap-2 font-heading font-semibold text-sm uppercase tracking-wider text-tactical-300 hover:text-neon-400 transition-colors" aria-label="Back to chat area">
              <ArrowLeft size={17} /> Back to Chat Area
            </button>
            {activeChannel === 'dm' && showDmReminder && <div className="mb-3 flex items-center justify-between gap-3 border border-neon-500/30 bg-neon-500/10 px-3 py-2 font-heading text-sm text-gray-300">
              <span>Install the Discord app and join the server to unlock guild chat.</span>
              <a href={guildSettings.discordServerUrl || import.meta.env.VITE_DISCORD_SERVER_URL || 'https://discord.gg/78bscsw4Yr'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-neon-300 whitespace-nowrap"><ExternalLink size={14} /> Join Server</a>
            </div>}
            <div className="h-[min(60vh,560px)] overflow-y-auto py-5 space-y-3">
              {visibleMessages.length === 0 && (
                <div className="h-full flex items-center justify-center font-mono text-xs text-gray-500 uppercase">
                  No messages yet. Start the channel.
                </div>
              )}
              {visibleMessages.map((message) => (
                <div
                  key={message.id}
                  className={`group relative flex items-end gap-2 ${message.authorId === member?.id ? 'justify-end' : 'justify-start'}`}
                  onContextMenu={(event) => { event.preventDefault(); setOpenMenuId(message.id); }}
                  onTouchStart={() => startLongPress(message.id)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                >
                  {message.authorId !== member?.id && (
                    <MessageAvatar member={members.find((item) => item.id === message.authorId || item.discordId === message.authorId)} name={message.authorName} />
                  )}
                  <div className={`relative max-w-[78%] min-w-[140px] px-3 py-2 rounded-2xl ${message.authorId === member?.id ? 'rounded-br-sm bg-neon-500/20' : 'rounded-bl-sm bg-ink-800/80'}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-heading font-bold text-white text-sm">{message.authorId === member?.id ? 'You' : message.authorName}</span>
                      <span className="font-mono text-[10px] uppercase text-neon-400">{ROLE_LABELS[message.authorRole]}</span>
                    </div>
                    <p className="mt-1 text-gray-300 font-heading text-sm break-words">{message.content}</p>
                    {message.attachment?.type === 'image' && <img src={message.attachment.dataUrl} alt={message.attachment.name} className="mt-2 max-h-64 max-w-full rounded-lg object-contain" />}
                    {message.attachment?.type === 'document' && <a href={message.attachment.dataUrl} download={message.attachment.name} className="mt-2 block text-neon-300 underline break-all">{message.attachment.name}</a>}
                    <div className="mt-1 flex items-center justify-end gap-1 font-mono text-[10px] text-gray-500">
                      {starredIds.includes(message.id) && <Star size={10} className="fill-neon-400 text-neon-400" />}
                      <span>{formatMessageTime(message.createdAt)}</span>
                      {message.authorId === member?.id && <span className={hasBeenSeenByEveryone(message) ? 'text-sky-400' : 'text-gray-500'}>✓✓</span>}
                    </div>
                  </div>
                  <button onClick={() => setOpenMenuId(openMenuId === message.id ? null : message.id)} className="p-1 text-gray-600 opacity-0 group-hover:opacity-100 hover:text-neon-400 transition-opacity" title="Message options" aria-label="Message options">
                    <ChevronDown size={16} />
                  </button>
                  {canDelete && (
                    null
                  )}
                  {openMenuId === message.id && (
                    <div className={`absolute z-20 top-full mt-1 w-44 rounded-lg bg-ink-800 border border-tactical-600 shadow-xl p-1 ${message.authorId === member?.id ? 'right-8' : 'left-8'}`}>
                      <button onClick={() => replyToMessage(message.content)} className="chat-action"><CornerUpLeft size={15} /> Reply</button>
                      <button onClick={() => copyMessage(message.content)} className="chat-action"><Copy size={15} /> Copy</button>
                      <button onClick={() => setOpenMenuId(null)} className="chat-action"><Smile size={15} /> React</button>
                      <button onClick={() => copyMessage(message.content)} className="chat-action"><Forward size={15} /> Forward</button>
                      <button onClick={() => setOpenMenuId(null)} className="chat-action"><Pin size={15} /> Pin</button>
                      <button onClick={() => toggleStar(message.id)} className="chat-action"><Star size={15} /> {starredIds.includes(message.id) ? 'Unstar' : 'Star'}</button>
                      {canDelete && <button onClick={() => { deleteChatMessage(message.id); setOpenMenuId(null); }} className="chat-action text-alert-400"><Trash2 size={15} /> Delete</button>}
                    </div>
                  )}
                </div>
              ))}
              {visibleTypingUsers.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 text-left font-heading text-sm text-tactical-300">
                  <div className="flex items-center gap-1 px-3 py-2 bg-ink-800/60 border border-ink-600">
                    <span>{visibleTypingUsers.map((item) => item.authorName).join(', ')} {visibleTypingUsers.length === 1 ? 'is' : 'are'} typing</span>
                    <span className="flex gap-0.5 ml-1" aria-hidden="true"><i className="w-1 h-1 rounded-full bg-neon-400 animate-bounce" /><i className="w-1 h-1 rounded-full bg-neon-400 animate-bounce [animation-delay:120ms]" /><i className="w-1 h-1 rounded-full bg-neon-400 animate-bounce [animation-delay:240ms]" /></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {pendingCameraImage && <div className="mb-2 flex items-center gap-2 border border-neon-500/40 bg-ink-800/70 p-2">
              <img src={pendingCameraImage.dataUrl} alt="Captured preview" className="h-12 w-12 rounded object-cover" />
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-tactical-300">Ready to send</span>
              <button type="button" onClick={() => setPendingCameraImage(null)} className="p-2 text-gray-400 hover:text-white" aria-label="Remove captured image" title="Remove captured image"><X size={16} /></button>
              <button type="button" onClick={sendPendingCameraImage} className="btn-neon flex items-center gap-2 px-3 py-2 text-xs" aria-label="Send captured image"><Send size={14} /> Send</button>
            </div>}
            <form onSubmit={submitMessage} onClick={(event) => event.stopPropagation()} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-2 pt-4 border-t border-tactical-700/30">
              <div className="relative">
                <button type="button" onClick={() => setShowAttachmentPicker((open) => !open)} className="flex h-12 w-12 items-center justify-center border border-tactical-700/40 text-neon-300 hover:bg-ink-800/60" aria-label="Add attachment" title="Add attachment">
                  <Plus size={20} />
                </button>
                {showAttachmentPicker && <div className="absolute bottom-14 left-0 z-30 w-48 glass-panel clip-tactical p-2 shadow-xl">
                  <button type="button" onClick={() => { setShowAttachmentPicker(false); cameraInputRef.current?.click(); }} className="chat-action"><Camera size={15} /> Camera</button>
                  <button type="button" onClick={() => { setShowAttachmentPicker(false); photoInputRef.current?.click(); }} className="chat-action">Photos</button>
                  <button type="button" onClick={() => { setShowAttachmentPicker(false); documentInputRef.current?.click(); }} className="chat-action">Documents</button>
                </div>}
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { handleAttachment(event.target.files?.[0], true); event.currentTarget.value = ''; }} />
                <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleAttachment(event.target.files?.[0])} />
                <input ref={documentInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.zip" className="hidden" onChange={(event) => handleAttachment(event.target.files?.[0])} />
              </div>
              <input
                value={draft}
                onChange={(event) => updateDraft(event.target.value)}
                placeholder="Send a message to the guild..."
                maxLength={500}
                className="flex-1 min-w-0 px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none"
              />
              <button type="submit" className="btn-neon px-4" aria-label="Send message" title="Send message">
                <Send size={17} />
              </button>
            </form>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageAvatar({ member, name }: { member?: { avatar: string; displayName: string }; name: string }) {
  return (
    <img
      src={member?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=f5a623&color=111827&size=100`}
      alt={name}
      onError={(event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=f5a623&color=111827&size=100`;
      }}
      className="w-8 h-8 flex-shrink-0 rounded-full object-cover border border-tactical-700/50"
    />
  );
}

function isRecentDirectMessage(message: { channel: string; authorId: string; recipientId?: string; createdAt: string }, participantId: string, currentMemberId: string | undefined, now: number): boolean {
  return message.channel === 'dm'
    && now - Date.parse(message.createdAt) < 24 * 60 * 60 * 1000
    && ((message.authorId === currentMemberId && message.recipientId === participantId) || (message.authorId === participantId && message.recipientId === currentMemberId));
}

function getLatestDirectMessage(participantId: string, currentMemberId: string | undefined, messages: Array<{ channel: string; authorId: string; recipientId?: string; createdAt: string; content: string }>) {
  return messages.filter((message) => message.channel === 'dm' && ((message.authorId === currentMemberId && message.recipientId === participantId) || (message.authorId === participantId && message.recipientId === currentMemberId))).sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))[0];
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}