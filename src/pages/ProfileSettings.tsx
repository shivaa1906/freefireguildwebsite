import { useAuth } from '@/context/AuthContext';
import { EMPTY_MEMBER_STATS, ROLE_LABELS, ROLE_COLORS, type DiscordPresence, type MemberStats } from '@/types';
import { GridBackground, ParticleField, Vignette } from '@/components/effects/VisualEffects';
import { User, Award, Shield, Edit2, Save, X, Bell, Lock, Globe, ExternalLink, KeyRound, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function ProfilePage() {
  const { member, updateMemberProfile, rankingScores } = useAuth();
  const discordBio = member?.discordBio || '';
  const discordStatus = member?.discordStatus || '';
  const rankScore = member ? rankingScores.filter((score) => score.memberId === member.id).reduce((total, score) => total + score.points, 0) : 0;
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(member?.bio || '');
  const [freeFireUid, setFreeFireUid] = useState(member?.freeFireUid || member?.application?.gameId || '');
  const [uidEditing, setUidEditing] = useState(false);

  if (!member) return null;

  return (
    <div className="min-h-screen bg-ink-900 relative overflow-hidden pt-16">
      <GridBackground />
      <ParticleField count={30} />
      <Vignette />

      <div className="relative z-10 px-4 md:px-8 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8 animate-fade-in-down">
            <div className="hud-label mb-1">PERSONAL PROFILE · MEMBER DATA</div>
            <h1 className="section-title text-3xl md:text-4xl">My Profile</h1>
          </div>

          {/* Discord profile card */}
          <div className="glass-panel clip-tactical-lg p-8 mb-6 animate-fade-in-up">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div className="font-mono text-xs text-neon-400 uppercase tracking-widest">Discord Profile</div>
              <a href={`https://discord.com/users/${member?.discordId}`} target="_blank" rel="noreferrer" className="btn-outline px-3 py-2 text-xs flex items-center gap-2 shrink-0"><ExternalLink size={13} /> Open Discord</a>
            </div>
            <div className="flex flex-col md:flex-row gap-8">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 -m-3 border border-neon-500/20 rotate-45" />
                  <img src={member.avatar} alt={member.displayName} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(member.displayName)}&background=f5a623&color=111827&size=200`; }} className="w-32 h-32 rounded-full object-cover border-2 border-neon-500/40" />
                  <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-ink-800 ${getPresenceDotColor(member.presence)}`} />
                </div>
                <div className={`font-mono text-xs uppercase ${getPresenceColor(member.presence)}`}>
                  Discord: {getPresenceLabel(member.presence)}
                </div>
                <div className={`px-3 py-1 font-heading font-semibold text-sm uppercase tracking-wider ${ROLE_COLORS[member.role]} bg-ink-800/50 border border-ink-600 clip-tactical`}>
                  {ROLE_LABELS[member.role]}
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 space-y-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="font-display font-bold text-2xl text-white">{member.displayName}</div>
                    <div className="inline-flex max-w-full rounded-md border border-tactical-600/60 bg-ink-800/50 px-3 py-2">
                      <span className="font-heading text-sm text-tactical-200 break-words">{discordStatus || 'What\'s on your mind?'}</span>
                    </div>
                  </div>
                  <div className="font-heading text-base text-tactical-200 mt-1">{member.discordName}</div>
                </div>
                <div>
                  <div className="font-mono text-xs text-gray-500 uppercase tracking-widest mb-1">Discord Bio</div>
                  <div className="font-heading text-sm text-gray-400 leading-relaxed">{discordBio || 'No Discord bio set.'}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div>
                    <div className="font-mono text-xs text-gray-500 uppercase tracking-widest mb-1">Discord ID</div>
                    <div className="font-mono text-xs text-tactical-200">{member.discordId}</div>
                  </div>
                </div>
                <div>
                  <div className="font-mono text-xs text-gray-500 uppercase tracking-widest mb-1">Rank Score</div>
                  <div className="font-heading font-semibold text-neon-300">{rankScore.toLocaleString()} pts</div>
                </div>
                <div>
                  <div className="font-mono text-xs text-gray-500 uppercase tracking-widest mb-1">Joined</div>
                  <div className="font-heading text-sm text-gray-400">{member.joinDate}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Bio section */}
          <div className="glass-panel clip-tactical p-6 mb-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <User size={20} className="text-neon-400" />
                <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider">Bio</h3>
              </div>
              <Lock size={16} className="text-gray-600" aria-label="Read-only bio" />
            </div>
            <p className="text-gray-400 font-heading text-base leading-relaxed">{member.bio || 'No website bio set.'}</p>
          </div>

          <div className="glass-panel clip-tactical p-6 mb-6 animate-fade-in-up" style={{ animationDelay: '125ms' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Shield size={20} className="text-neon-400" />
                <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider">Free Fire UID</h3>
              </div>
              {uidEditing ? (
                <div className="flex gap-2">
                  <button onClick={() => { setFreeFireUid(member.freeFireUid || member.application?.gameId || ''); setUidEditing(false); }} className="p-2 text-gray-500 hover:text-alert-400 transition-colors" aria-label="Cancel UID editing"><X size={18} /></button>
                  <button onClick={() => { if (/^\d{5,15}$/.test(freeFireUid.trim())) { updateMemberProfile({ freeFireUid: freeFireUid.trim() }); setUidEditing(false); } }} className="p-2 text-gray-500 hover:text-success-400 transition-colors" aria-label="Save Free Fire UID"><Save size={18} /></button>
                </div>
              ) : (
                <button onClick={() => setUidEditing(true)} className="p-2 text-gray-500 hover:text-neon-400 transition-colors" aria-label="Edit Free Fire UID"><Edit2 size={16} /></button>
              )}
            </div>
            {uidEditing ? (
              <input value={freeFireUid} inputMode="numeric" pattern="[0-9]{5,15}" onChange={(event) => setFreeFireUid(event.target.value.replace(/\D/g, ''))} placeholder="Enter Free Fire UID" className="w-full px-4 py-3 bg-ink-800/50 border border-neon-500/40 text-white font-heading focus:border-neon-500/50 focus:outline-none clip-tactical" />
            ) : (
              <div className="font-display font-bold text-xl text-white">{freeFireUid || 'Not submitted'}</div>
            )}
            <p className="mt-2 font-mono text-xs text-gray-500">Only the Free Fire UID can be edited here. Combat stats remain read-only.</p>
          </div>

          {/* Stats section */}
          <div className="glass-panel clip-tactical p-6 mb-6 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider">Combat Stats</h3>
              <Lock size={16} className="text-gray-600" aria-label="Read-only combat stats" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatField label="Account Level" value={member.stats?.accountLevel ?? EMPTY_MEMBER_STATS.accountLevel} />
              <StatField label="Matches" value={member.stats?.matches ?? EMPTY_MEMBER_STATS.matches} />
              <StatField label="Win Rate" suffix="%" value={member.stats?.winRate ?? EMPTY_MEMBER_STATS.winRate} />
              <StatField label="Eliminations" value={member.stats?.eliminations ?? EMPTY_MEMBER_STATS.eliminations} />
              <StatField label="Booyahs" value={member.stats?.booyahs ?? EMPTY_MEMBER_STATS.booyahs} />
              <StatField label="Headshot Rate" suffix="%" value={member.stats?.headshotRate ?? EMPTY_MEMBER_STATS.headshotRate} />
            </div>
          </div>

          {/* Achievements */}
          <div className="glass-panel clip-tactical p-6 mb-6 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center gap-2 mb-4">
              <Award size={20} className="text-neon-400" />
              <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider">Achievements</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {member.achievements.map((ach, i) => (
                <div key={i} className="px-3 py-2 bg-neon-500/10 border border-neon-500/30 font-heading font-semibold text-sm text-neon-300 uppercase tracking-wider clip-tactical">
                  {ach}
                </div>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            {[
              { icon: Bell, label: 'Notifications', desc: 'Manage alerts' },
              { icon: Lock, label: 'Security', desc: 'Account security' },
              { icon: Globe, label: 'Privacy', desc: 'Privacy settings' },
            ].map((link, i) => {
              const Icon = link.icon;
              return (
                <button key={i} className="tactical-card p-5 text-left group">
                  <Icon size={24} className="text-neon-400 mb-3" />
                  <div className="font-heading font-bold text-white text-sm uppercase tracking-wider">{link.label}</div>
                  <div className="font-mono text-xs text-gray-500">{link.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatField({ label, suffix = '', value }: { label: string; suffix?: string; value: number }) {
  return (
    <div className="p-3 bg-ink-800/30 border border-ink-600">
      <div className="font-mono text-[10px] text-gray-500 uppercase tracking-widest mb-2">{label}</div>
      <div className="font-display font-bold text-xl text-white">{value.toLocaleString()}{suffix}</div>
    </div>
  );
}

function getPresenceLabel(presence: DiscordPresence | undefined): string {
  if (presence === 'idle') return 'Idle';
  if (presence === 'dnd') return 'Do Not Disturb';
  if (presence === 'online') return 'Online';
  return 'Offline';
}

function getPresenceColor(presence: DiscordPresence | undefined): string {
  if (presence === 'idle') return 'text-warning-400';
  if (presence === 'dnd') return 'text-alert-400';
  if (presence === 'online') return 'text-success-400';
  return 'text-gray-500';
}

function getPresenceDotColor(presence: DiscordPresence | undefined): string {
  if (presence === 'idle') return 'bg-warning-500';
  if (presence === 'dnd') return 'bg-alert-500';
  if (presence === 'online') return 'bg-success-500';
  return 'bg-gray-600';
}

export function SettingsPage() {
  const { member, logout, deleteAccount, theme, setTheme, preferences, updatePreference, previewNotificationSound, saveHlGamingApiKey } = useAuth();
  const customSoundInputRef = useRef<HTMLInputElement>(null);
  const [hlGamingApiKey, setHlGamingApiKey] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [apiKeyError, setApiKeyError] = useState('');
  const [showApiInstructions, setShowApiInstructions] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteAccountSaving, setDeleteAccountSaving] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState('');

  const handleDeleteAccount = async () => {
    setDeleteAccountSaving(true);
    setDeleteAccountError('');
    try {
      await deleteAccount();
    } catch (error) {
      setDeleteAccountError(error instanceof Error ? error.message : 'Account could not be deleted.');
      setDeleteAccountSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-900 relative overflow-hidden pt-16">
      <GridBackground />
      <ParticleField count={30} />
      <Vignette />

      <div className="relative z-10 px-4 md:px-8 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8 animate-fade-in-down">
            <div className="hud-label mb-1">CONFIGURATION · PREFERENCES</div>
            <h1 className="section-title text-3xl md:text-4xl">Settings</h1>
          </div>

          {/* Display settings */}
          <div className="glass-panel clip-tactical p-6 mb-6 animate-fade-in-up">
            <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-4">Theme</h3>
            <div className="flex gap-3 mb-6">
              {(['dark', 'bright'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setTheme(option)}
                  className={`flex-1 px-4 py-3 font-heading font-semibold uppercase tracking-wider clip-tactical border transition-all ${theme === option ? 'bg-neon-500/20 text-neon-300 border-neon-500/50' : 'text-gray-500 border-tactical-700/40 hover:text-tactical-200'}`}
                >
                  {option === 'dark' ? 'Dark Theme' : 'Bright Theme'}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-panel clip-tactical p-6 mb-6 animate-fade-in-up">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound size={20} className="text-neon-400" />
              <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider">HL Gaming API Key</h3>
            </div>
            <p className="font-mono text-xs text-gray-500 mb-4">Members with a saved key refresh every 7 days. The key is encrypted on the server and never displayed again. Members without a key use the shared pool and refresh every 14 days.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input id="hl-gaming-api-key" type="password" value={hlGamingApiKey} onChange={(event) => setHlGamingApiKey(event.target.value)} placeholder={member?.hasHlGamingApiKey ? 'API key already saved' : 'Enter HL Gaming API key'} className="flex-1 px-4 py-3 bg-ink-800/50 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none clip-tactical" />
              <button onClick={() => { setApiKeyError(''); if (hlGamingApiKey.trim().length < 8) { setApiKeyError('Enter a valid HL Gaming API key.'); return; } void saveHlGamingApiKey(hlGamingApiKey.trim()).then(() => { setHlGamingApiKey(''); setApiKeySaved(true); setTimeout(() => setApiKeySaved(false), 2500); }).catch((error: Error) => setApiKeyError(error.message)); }} className="btn-neon inline-flex items-center justify-center gap-2"><Save size={16} /> Save Key</button>
            </div>
            {apiKeySaved && <div className="mt-2 font-mono text-xs text-success-400">API KEY SAVED SECURELY</div>}
            {apiKeyError && <div className="mt-2 font-mono text-xs text-alert-400">{apiKeyError}</div>}
            <button onClick={() => setShowApiInstructions(true)} className="mt-4 btn-outline inline-flex items-center gap-2 text-xs"><ExternalLink size={13} /> Setup Instructions</button>
          </div>

          <div className="glass-panel clip-tactical p-6 mb-6 animate-fade-in-up">
            <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-4">Display & Graphics</h3>
            <div className="space-y-4">
              <ToggleRow label="Reduced Motion" desc="Simplify animations" value={preferences.reducedMotion} onChange={(value) => updatePreference('reducedMotion', value)} />
              <ToggleRow label="High Graphics" desc="Enable advanced 3D effects" value={preferences.highGraphics} onChange={(value) => updatePreference('highGraphics', value)} />
              <ToggleRow label="Particle Effects" desc="Show ambient particles" value={preferences.particleEffects} onChange={(value) => updatePreference('particleEffects', value)} />
            </div>
          </div>

          {/* Sound settings */}
          <div className="glass-panel clip-tactical p-6 mb-6 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-4">Sound</h3>
            <div className="space-y-4">
              <ToggleRow label="UI Sound Effects" desc="Click and transition sounds" value={preferences.uiSoundEffects} onChange={(value) => updatePreference('uiSoundEffects', value)} />
              <ToggleRow label="Ambient Audio" desc="Background atmosphere" value={preferences.ambientAudio} onChange={(value) => updatePreference('ambientAudio', value)} />
              <label className="flex items-center justify-between gap-4 p-3 bg-ink-800/30 border border-ink-600">
                <span>
                  <span className="block font-heading font-semibold text-white text-sm">Notification Sound</span>
                  <span className="block font-mono text-xs text-gray-500">Sound played for incoming messages</span>
                </span>
                <select value={preferences.notificationSound} onChange={(event) => { const sound = event.target.value as typeof preferences.notificationSound; updatePreference('notificationSound', sound); previewNotificationSound(sound); }} className="px-3 py-2 bg-ink-800/60 border border-tactical-700/40 text-white font-heading text-sm focus:border-neon-500/50 focus:outline-none">
                  <option value="tactical">Tactical Pulse</option>
                  <option value="double-ping">Double Ping</option>
                  <option value="soft-chime">Soft Chime</option>
                  <option value="radar">Radar Sweep</option>
                  <option value="alert">Alert Burst</option>
                  <option value="sonar">Sonar</option>
                  {preferences.customNotificationSound && <option value="custom">Custom: {preferences.customNotificationName || 'Uploaded sound'}</option>}
                  <option value="off">Off</option>
                </select>
              </label>
              <div className="p-3 bg-ink-800/30 border border-ink-600">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-heading font-semibold text-white text-sm">Custom Notification Sound</div>
                    <div className="font-mono text-xs text-gray-500">Upload an audio file for your alerts</div>
                  </div>
                  <button type="button" onClick={() => customSoundInputRef.current?.click()} className="btn-outline px-3 py-2 text-xs">Choose File</button>
                </div>
                <input ref={customSoundInputRef} type="file" accept="audio/*" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) {
                    event.target.value = '';
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result !== 'string') return;
                    updatePreference('customNotificationSound', reader.result);
                    updatePreference('customNotificationName', file.name);
                    updatePreference('notificationSound', 'custom');
                    const audio = new Audio(reader.result);
                    void audio.play().catch(() => undefined);
                  };
                  reader.readAsDataURL(file);
                  event.target.value = '';
                }} />
                {preferences.customNotificationSound && <button type="button" onClick={() => { updatePreference('customNotificationSound', ''); if (preferences.notificationSound === 'custom') updatePreference('notificationSound', 'tactical'); }} className="mt-2 font-mono text-xs text-alert-400 hover:text-alert-300">Remove custom sound</button>}
              </div>
            </div>
          </div>

          {/* Account */}
          <div className="glass-panel clip-tactical p-6 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
            <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-4">Account</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-ink-800/30 border border-ink-600">
                <div>
                  <div className="font-heading font-semibold text-white text-sm">Discord Account</div>
                  <div className="font-mono text-xs text-gray-500">{member?.discordName}</div>
                </div>
                <Shield size={18} className="text-success-400" />
              </div>
              <button onClick={logout} className="w-full p-3 bg-alert-500/10 border border-alert-500/30 text-alert-400 font-heading font-semibold text-sm uppercase tracking-wider hover:bg-alert-500/20 transition-all clip-tactical">
                Sign Out
              </button>
              <button onClick={() => { setDeleteAccountError(''); setDeleteConfirmOpen(true); }} className="w-full p-3 border border-alert-500/40 text-alert-300 font-heading font-semibold text-sm uppercase tracking-wider hover:bg-alert-500/10 transition-all clip-tactical flex items-center justify-center gap-2">
                <Trash2 size={16} /> Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>
      {showApiInstructions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowApiInstructions(false)}>
          <div className="absolute inset-0 bg-ink-950/85 backdrop-blur-sm" />
          <div className="relative glass-panel clip-tactical-lg p-6 md:p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-in" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <div className="hud-label mb-1">HL GAMING · API ACCESS</div>
                <h2 className="font-display font-bold text-2xl text-white uppercase tracking-wider">Setup Instructions</h2>
              </div>
              <button onClick={() => setShowApiInstructions(false)} className="p-2 text-gray-500 hover:text-white" aria-label="Close setup instructions"><X size={20} /></button>
            </div>
            <div className="space-y-5 font-heading text-gray-300">
              <section>
                <h3 className="font-bold text-white uppercase tracking-wider mb-2">1. Get your API key</h3>
                <p className="text-sm leading-relaxed">Open the HL Gaming API dashboard, sign in to your account, and create or copy an active API key.</p>
                <a href="https://www.hlgamingofficial.com/p/api.html" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-neon-300 hover:text-neon-200 font-mono text-xs"><ExternalLink size={14} /> Open HL Gaming API dashboard</a>
              </section>
              <section>
                <h3 className="font-bold text-white uppercase tracking-wider mb-2">2. Add it here</h3>
                <p className="text-sm leading-relaxed">Copy the key from HL Gaming, paste it into the API key field, and click Save Key. Your key is encrypted on the server and is never shown again.</p>
              </section>
              <section>
                <h3 className="font-bold text-white uppercase tracking-wider mb-2">3. Refresh schedule</h3>
                <p className="text-sm leading-relaxed">Members with a personal key refresh once every 7 days. Members without a personal key use the shared pool and refresh once every 14 days.</p>
              </section>
              <section>
                <h3 className="font-bold text-white uppercase tracking-wider mb-2">4. Important security notes</h3>
                <p className="text-sm leading-relaxed">Do not paste your key into chat or share it with another member. Only add keys from the official HL Gaming dashboard. The application never exposes saved keys in the browser.</p>
              </section>
            </div>
            <div className="mt-7 flex justify-end">
              <button onClick={() => setShowApiInstructions(false)} className="btn-neon px-5 py-3">Close</button>
            </div>
          </div>
        </div>
      )}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" onClick={() => !deleteAccountSaving && setDeleteConfirmOpen(false)}>
          <div className="absolute inset-0 bg-ink-950/85 backdrop-blur-sm" />
          <div className="relative glass-panel clip-tactical-lg p-6 md:p-8 max-w-md w-full animate-scale-in" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start gap-3 mb-5">
              <Trash2 size={22} className="text-alert-400 mt-1" />
              <div>
                <h2 className="font-display font-bold text-xl text-white uppercase tracking-wider">Delete Account?</h2>
                <p className="mt-2 text-gray-400 font-heading leading-relaxed">This permanently deletes your website account, member card, chat history, ranking data, saved API key, and cached stats. This cannot be undone.</p>
              </div>
            </div>
            {deleteAccountError && <div className="mb-4 font-mono text-xs text-alert-400">{deleteAccountError}</div>}
            <div className="flex gap-3">
              <button onClick={() => void handleDeleteAccount()} disabled={deleteAccountSaving} className="flex-1 bg-alert-500 px-4 py-3 font-heading font-semibold uppercase text-white clip-tactical disabled:opacity-60">{deleteAccountSaving ? 'Deleting...' : 'Confirm Delete'}</button>
              <button onClick={() => setDeleteConfirmOpen(false)} disabled={deleteAccountSaving} className="flex-1 btn-outline">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 bg-ink-800/30 border border-ink-600">
      <div>
        <div className="font-heading font-semibold text-white text-sm">{label}</div>
        <div className="font-mono text-xs text-gray-500">{desc}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        aria-pressed={value}
        className={`relative w-12 h-6 rounded-full transition-colors ${value ? 'bg-neon-500/40' : 'bg-ink-600'}`}
      >
        <div className={`absolute top-1 w-4 h-4 rounded-full transition-transform ${value ? 'translate-x-7 bg-neon-400' : 'translate-x-1 bg-gray-500'}`} />
      </button>
    </div>
  );
}
