import { useState, useEffect, useRef } from 'react';
import { useAuth, type AppView } from '@/context/AuthContext';
import { Home, Users, Trophy, Megaphone, User, Settings, Shield, LogOut, Menu, X, MessageCircle, Medal, ExternalLink } from 'lucide-react';
import { ROLE_LABELS } from '@/types';

const discordServerUrl = import.meta.env.VITE_DISCORD_SERVER_URL || 'https://discord.gg/78bscsw4Yr';

const NAV_ITEMS: { view: AppView; label: string; icon: typeof Home; adminOnly?: boolean; chatOnly?: boolean; rankingOnly?: boolean }[] = [
  { view: 'lobby', label: 'Home', icon: Home },
  { view: 'members', label: 'Guild Members', icon: Users },
  { view: 'events', label: 'Guild Events', icon: Trophy },
  { view: 'ranking', label: 'Rankings', icon: Medal, rankingOnly: true },
  { view: 'announcements', label: 'Announcements', icon: Megaphone },
  { view: 'chat', label: 'Chat', icon: MessageCircle, chatOnly: true },
  { view: 'profile', label: 'Profile', icon: User },
  { view: 'settings', label: 'Settings', icon: Settings },
  { view: 'admin', label: 'Admin Command', icon: Shield, adminOnly: true },
];

export function Navigation() {
  const { member, view, setView, logout, guildSettings, unreadChatCount } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [profileMenuOpen]);

  const items = NAV_ITEMS.filter((item) => (!item.adminOnly || member?.role === 'admin' || member?.role === 'coadmin') && (!item.chatOnly || Boolean(member)) && (!item.rankingOnly || Boolean(member && ['admin', 'coadmin', 'moderator', 'member'].includes(member.role))));

  return (
    <>
      {/* Top nav bar */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 xl:bottom-0 xl:right-auto xl:w-64 xl:border-r xl:border-tactical-700/30 ${
          scrolled ? 'bg-ink-900/90 backdrop-blur-md' : 'bg-ink-900/80 backdrop-blur-md'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8 xl:max-w-none xl:h-full xl:px-4">
          <div className="flex items-center justify-between h-16 xl:h-full xl:flex-col xl:items-stretch xl:justify-start">
            {/* Logo */}
            <button onClick={() => setView('lobby')} className="flex items-center gap-3 group xl:py-5">
              <div className="relative w-9 h-9">
                <div className="absolute inset-0 border-2 border-neon-500/60 rotate-45 group-hover:rotate-90 transition-transform duration-500" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-display font-black text-sm text-neon-400">FF</span>
                </div>
              </div>
              <span className="font-display font-bold text-sm tracking-widest text-white uppercase hidden sm:block">
                {guildSettings.name}
              </span>
            </button>

            {/* Desktop nav */}
            <div className="hidden xl:flex xl:flex-1 xl:flex-col xl:items-stretch xl:gap-2 xl:py-6">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = view === item.view;
                return (
                  <button
                    key={item.view}
                    onClick={() => setView(item.view)}
                    className={`relative px-3 py-3 flex items-center gap-3 text-left font-heading font-semibold text-sm uppercase tracking-wider transition-all duration-300 border-l-2 ${
                      isActive
                        ? 'text-neon-400 bg-neon-500/10 border-neon-500'
                        : 'text-gray-400 border-transparent hover:text-tactical-200 hover:bg-ink-800/40'
                    }`}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                    {item.view === 'chat' && unreadChatCount > 0 && <span className="ml-auto min-w-5 rounded-full bg-alert-500 px-1.5 py-0.5 text-center font-mono text-[10px] text-white">{unreadChatCount > 99 ? '99+' : unreadChatCount}</span>}
                  </button>
                );
              })}
            </div>

            {/* User badge + logout */}
            <div className="hidden xl:flex items-center gap-3 xl:mt-auto xl:pb-5">
              <div ref={profileMenuRef} className="relative">
                <button
                  onClick={() => setProfileMenuOpen((isOpen) => !isOpen)}
                  className="flex min-w-0 items-center gap-2 px-3 py-1.5 glass-panel clip-tactical hover:border-neon-500/50 transition-colors"
                  aria-expanded={profileMenuOpen}
                  aria-label={`Open profile menu for ${member?.displayName || 'Discord profile'}`}
                >
                <span className="relative shrink-0">
                  <img src={member?.avatar} alt={member?.displayName || 'Discord profile'} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(member?.displayName || 'Discord user')}&background=f5a623&color=111827&size=200`; }} className="w-7 h-7 rounded-full object-cover border border-neon-500/30" />
                  <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-ink-900 ${getPresenceDotColor(member?.presence)}`} title={`Discord: ${getPresenceLabel(member?.presence)}`} />
                </span>
                <div className="w-[120px] min-w-0 text-xs leading-tight">
                  <MarqueeText className="text-white font-heading font-semibold text-xs">{member?.displayName || 'Discord profile'}</MarqueeText>
                  <MarqueeText className="text-neon-400 font-mono text-[9px] uppercase tracking-wide">{member ? ROLE_LABELS[member.role] : ''}</MarqueeText>
                </div>
                </button>
                {profileMenuOpen && (
                  <div className="absolute left-0 bottom-full mb-2 w-52 glass-panel clip-tactical p-1 animate-fade-in-down">
                    <div className="border-b border-tactical-700/30 px-3 py-2">
                      <div className="truncate font-heading font-semibold text-sm text-white">{member?.displayName || 'Discord profile'}</div>
                      <div className="font-mono text-[10px] uppercase tracking-wide text-neon-400">{member ? ROLE_LABELS[member.role] : ''}</div>
                    </div>
                    <a
                      href={guildSettings.discordServerUrl || discordServerUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left font-heading font-semibold text-sm uppercase tracking-wider text-white hover:bg-neon-500/10 transition-colors"
                    >
                      <ExternalLink size={16} />
                      Join Guild Discord
                    </a>
                    <button
                      onClick={() => { setProfileMenuOpen(false); logout(); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left font-heading font-semibold text-sm uppercase tracking-wider text-alert-400 hover:bg-alert-500/10 transition-colors"
                    >
                      <LogOut size={16} />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="xl:hidden p-2 text-tactical-200"
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 overflow-y-auto xl:hidden">
          <div className="absolute inset-0 bg-ink-900/95 backdrop-blur-md" onClick={() => setMobileOpen(false)} />
          <div className="relative pt-20 px-4 flex flex-col gap-2">
            {items.map((item, i) => {
              const Icon = item.icon;
              const isActive = view === item.view;
              return (
                <button
                  key={item.view}
                  onClick={() => {
                    setView(item.view);
                    setMobileOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 font-heading font-semibold uppercase tracking-wider transition-all animate-slide-in-right ${
                    isActive
                      ? 'text-neon-400 bg-neon-500/10 border-l-2 border-neon-500'
                      : 'text-gray-400 border-l-2 border-transparent'
                  }`}
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <Icon size={20} />
                  <span>{item.label}</span>
                  {item.view === 'chat' && unreadChatCount > 0 && <span className="ml-auto min-w-5 rounded-full bg-alert-500 px-1.5 py-0.5 text-center font-mono text-[10px] text-white">{unreadChatCount > 99 ? '99+' : unreadChatCount}</span>}
                </button>
              );
            })}
            <button
              onClick={logout}
              className="flex items-center gap-3 px-4 py-3 font-heading font-semibold uppercase tracking-wider text-alert-400 mt-4"
            >
              <LogOut size={20} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function getPresenceDotColor(presence?: string): string {
  if (presence === 'online') return 'bg-success-400';
  if (presence === 'idle') return 'bg-warning-400';
  if (presence === 'dnd') return 'bg-alert-400';
  return 'bg-gray-500';
}

function getPresenceLabel(presence?: string): string {
  if (presence === 'dnd') return 'Do Not Disturb';
  return presence ? presence.charAt(0).toUpperCase() + presence.slice(1) : 'Offline';
}

function MarqueeText({ children, className }: { children: string; className: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const updateOverflow = () => {
      if (containerRef.current && contentRef.current) {
        setIsOverflowing(contentRef.current.scrollWidth > containerRef.current.clientWidth);
      }
    };
    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [children]);

  return (
    <div ref={containerRef} className="overflow-hidden whitespace-nowrap">
      <div className={isOverflowing ? 'profile-marquee-track' : 'inline-block'}>
        <span ref={contentRef} className={`${className} inline-block`}>{children}</span>
        {isOverflowing && <span aria-hidden="true" className={`${className} ml-8`}>{children}</span>}
      </div>
    </div>
  );
}
