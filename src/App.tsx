import { Component, useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { AuthProvider, useAuth, type AppView } from '@/context/AuthContext';
import type { GuildMember } from '@/types';
import { LandingPage } from '@/pages/LandingPage';
import { PendingApproval } from '@/pages/PendingApproval';
import { LoadingSequence } from '@/components/effects/LoadingSequence';
import { Navigation } from '@/components/layout/Navigation';
import { GuildLobby } from '@/pages/GuildLobby';
import { GuildMembers } from '@/pages/GuildMembers';
import { MemberProfile } from '@/pages/MemberProfile';
import { GuildEvents } from '@/pages/GuildEvents';
import { Tournaments } from '@/pages/Tournaments';
import { RankingPage } from '@/pages/RankingPage';
import { Announcements } from '@/pages/Announcements';
import { ChatPage } from '@/pages/ChatPage';
import { AdminDashboard } from '@/pages/AdminDashboard';
import { ProfilePage, SettingsPage } from '@/pages/ProfileSettings';
import { NotFoundPage, ServerErrorPage } from '@/pages/ErrorPages';

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.setState({ hasError: true });
  }

  render() {
    return this.state.hasError ? <ServerErrorPage /> : this.props.children;
  }
}

function AppContent() {
  const { authLoading, isAuthenticated, view, setView, members, member } = useAuth();
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(false);
  const [openedMember, setOpenedMember] = useState<GuildMember | null>(null);
  const query = new URLSearchParams(window.location.search);
  const memberId = query.get('member');
  const adminTab = query.get('adminTab');
  const isRootPath = window.location.pathname === '/';

  useEffect(() => {
    if (!memberId) {
      setOpenedMember(null);
      return;
    }
    const fromList = members.find((item) => item.id === memberId);
    if (fromList) {
      setOpenedMember(fromList);
      return;
    }
    if (!member) {
      setOpenedMember(null);
      return;
    }
    let ignore = false;
    void import('@/lib/api').then(({ guildApi }) => guildApi.memberProfile<GuildMember>(memberId)
      .then((profile) => {
        if (!ignore) setOpenedMember(profile);
      })
      .catch(() => {
        if (!ignore) setOpenedMember(null);
      }));
    return () => {
      ignore = true;
    };
  }, [memberId, member, members]);

  useEffect(() => {
    if (memberId && view === 'loading') setView('members');
    if (adminTab === 'apiKeys' && view !== 'admin') setView('admin');
    if (view === 'character') setView('lobby');
  }, [adminTab, memberId, setView, view]);

  useEffect(() => {
    if (!member || member.hasHlGamingApiKey) {
      setShowApiKeyPrompt(false);
      return;
    }
    const promptSessionKey = `hl-gaming-key-prompt-session:${member.id}`;
    const promptLastShownKey = `hl-gaming-key-prompt-last-shown:${member.id}`;
    if (window.sessionStorage.getItem(promptSessionKey) === 'shown') return;
    const lastShownAt = Number(window.localStorage.getItem(promptLastShownKey) || 0);
    if (Date.now() - lastShownAt < 60 * 60 * 1000) return;
    window.sessionStorage.setItem(promptSessionKey, 'shown');
    window.localStorage.setItem(promptLastShownKey, String(Date.now()));
    setShowApiKeyPrompt(true);
  }, [member]);

  if (!isRootPath) {
    return <NotFoundPage />;
  }

  if (authLoading) {
    return memberId ? <MemberDetailsLoading /> : <LoadingSequence onComplete={() => undefined} />;
  }

  if (view === 'pending') {
    return <PendingApproval />;
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  if (view === 'loading') {
    if (memberId) return <MemberDetailsLoading />;
    return <LoadingSequence onComplete={() => setView('lobby')} />;
  }

  if (openedMember) {
    return <MemberProfile member={openedMember} onBack={() => {
      if (window.opener && !window.opener.closed) {
        window.opener.focus();
        window.close();
        return;
      }
      window.history.replaceState({}, '', window.location.pathname);
      setView('members');
    }} />;
  }

  const handleNavigate = (target: AppView) => {
    setView(target);
  };

  return (
    <div className="xl:pl-64">
      <Navigation />
      {view === 'lobby' && <GuildLobby onNavigate={handleNavigate} />}
      {view === 'members' && (
        <GuildMembers
          members={members}
          onSelectMember={(m) => {
            const memberUrl = new URL(window.location.href);
            memberUrl.search = `?member=${encodeURIComponent(m.id)}`;
            window.open(memberUrl.toString(), '_blank');
          }}
        />
      )}
      {view === 'profile' && <ProfilePage />}
      {view === 'events' && <GuildEvents />}
      {view === 'tournaments' && <Tournaments />}
      {view === 'ranking' && <RankingPage />}
      {view === 'announcements' && <Announcements />}
      {view === 'chat' && <ChatPage />}
      {view === 'admin' && <AdminDashboard />}
      {view === 'settings' && <SettingsPage />}
      {showApiKeyPrompt && <div className="fixed bottom-5 right-5 z-40 w-[min(22rem,calc(100vw-2rem))] glass-panel clip-tactical p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-heading font-bold text-white uppercase tracking-wider">Add an HL Gaming key</div>
            <p className="mt-2 font-mono text-xs leading-relaxed text-gray-400">Add your key for a weekly refresh. Without one, your data refreshes every two weeks using the shared pool.</p>
          </div>
          <button onClick={() => setShowApiKeyPrompt(false)} className="p-1 text-gray-500 hover:text-white" aria-label="Dismiss API key prompt"><X size={16} /></button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={() => { setShowApiKeyPrompt(false); setView('settings'); }} className="btn-neon px-3 py-2 text-xs">Add Key</button>
          <button onClick={() => { setShowApiKeyPrompt(false); setView('settings'); }} className="btn-outline px-3 py-2 text-xs">Instructions</button>
        </div>
      </div>}
    </div>
  );
}

function MemberDetailsLoading() {
  return (
    <div className="fixed inset-0 bg-ink-900 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-5 border-2 border-ink-600 border-t-neon-400 rounded-full animate-spin" />
        <div className="font-display text-sm tracking-[0.25em] text-neon-400 uppercase animate-pulse">Loading user details...</div>
        <div className="font-mono text-xs text-gray-500 mt-2">SYNCING MEMBER DATA</div>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppErrorBoundary>
        <AppContent />
      </AppErrorBoundary>
    </AuthProvider>
  );
}

export default App;
