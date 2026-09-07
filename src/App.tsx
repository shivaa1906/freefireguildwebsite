import { useEffect } from 'react';
import { AuthProvider, useAuth, type AppView } from '@/context/AuthContext';
import { LandingPage } from '@/pages/LandingPage';
import { PendingApproval } from '@/pages/PendingApproval';
import { LoadingSequence } from '@/components/effects/LoadingSequence';
import { Navigation } from '@/components/layout/Navigation';
import { GuildLobby } from '@/pages/GuildLobby';
import { GuildMembers } from '@/pages/GuildMembers';
import { MemberProfile } from '@/pages/MemberProfile';
import { CharacterCustomization } from '@/pages/CharacterCustomization';
import { GuildEvents } from '@/pages/GuildEvents';
import { RankingPage } from '@/pages/RankingPage';
import { Announcements } from '@/pages/Announcements';
import { ChatPage } from '@/pages/ChatPage';
import { AdminDashboard } from '@/pages/AdminDashboard';
import { ProfilePage, SettingsPage } from '@/pages/ProfileSettings';

function AppContent() {
  const { authLoading, isAuthenticated, view, setView, members } = useAuth();
  const memberId = new URLSearchParams(window.location.search).get('member');
  const openedMember = memberId ? members.find((item) => item.id === memberId) : null;

  useEffect(() => {
    if (memberId && view === 'loading') setView('members');
  }, [memberId, setView, view]);

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
      {view === 'character' && <CharacterCustomization />}
      {view === 'events' && <GuildEvents />}
      {view === 'ranking' && <RankingPage />}
      {view === 'announcements' && <Announcements />}
      {view === 'chat' && <ChatPage />}
      {view === 'admin' && <AdminDashboard />}
      {view === 'settings' && <SettingsPage />}
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
      <AppContent />
    </AuthProvider>
  );
}

export default App;
