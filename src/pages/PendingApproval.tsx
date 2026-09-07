import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { GridBackground, ParticleField, Vignette } from '@/components/effects/VisualEffects';
import { Clock, ShieldQuestion, Upload, FileImage, LogIn, X, ExternalLink, RefreshCw } from 'lucide-react';

export function PendingApproval() {
  const { member, isAuthenticated, setView, submitJoinApplication } = useAuth();
  const [form, setForm] = useState({ fullName: '', gameId: '', experience: '', imageName: '', acceptedTerms: false });
  const [submitted, setSubmitted] = useState(Boolean(member?.application));
  const needsDiscordJoin = Boolean(member && member.isInDiscordGuild === false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAuthenticated) {
      setView('landing');
      return;
    }
    if (!form.fullName || !form.gameId || !form.imageName || !form.acceptedTerms) return;
    submitJoinApplication(form);
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-ink-900 relative overflow-hidden flex items-center justify-center px-4">
      <GridBackground />
      <ParticleField count={40} />
      <Vignette />

      <div className="relative z-10 max-w-lg w-full">
        <div className="glass-panel clip-tactical-lg p-8 md:p-12 text-center relative">
          <button
            type="button"
            onClick={() => setView(isAuthenticated ? 'members' : 'landing')}
            className="absolute top-4 right-4 p-2 text-gray-500 hover:text-neon-400 transition-colors"
            title="Go back"
            aria-label="Go back"
          >
            <X size={22} />
          </button>
          {/* Status icon */}
          <div className="flex justify-center mb-6">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 border-2 border-warning-500/60 rotate-45 animate-pulse-glow" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Clock size={36} className="text-warning-400" />
              </div>
            </div>
          </div>

          <h1 className="font-display font-black text-3xl text-white tracking-wider uppercase mb-3">{needsDiscordJoin ? 'Join Discord First' : submitted ? 'Pending Approval' : 'Join The Guild'}</h1>

          {member && <div className="flex items-center gap-4 text-left p-4 mb-6 bg-ink-800/40 border border-tactical-700/40 clip-tactical">
            <img
              src={member.avatar}
              alt={member.displayName}
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(member.displayName)}&background=f5a623&color=111827&size=200`;
              }}
              className="w-14 h-14 rounded-full object-cover border-2 border-neon-500/40"
            />
            <div className="min-w-0">
              <div className="font-heading font-bold text-white text-lg truncate">{member.displayName}</div>
              <div className="font-mono text-xs text-tactical-300 truncate">{member.discordName}</div>
              <div className="font-mono text-[10px] text-gray-500 mt-1">DISCORD ID: {member.discordId}</div>
            </div>
          </div>}

          {needsDiscordJoin ? (
            <div className="space-y-4 mb-8">
              <p className="text-gray-400 font-heading text-base leading-relaxed">Joining the Discord server is optional for browsing, but required before guild access and chat can be enabled.</p>
              <a href="https://discord.com/oauth2/authorize?client_id=1546098098575511603" target="_blank" rel="noreferrer" className="btn-neon w-full flex items-center justify-center gap-2">
                <ExternalLink size={16} /> Install Discord App
              </a>
              <button onClick={() => window.location.reload()} className="btn-outline w-full flex items-center justify-center gap-2">
                <RefreshCw size={16} /> I Joined, Check Again
              </button>
            </div>
          ) : !submitted && (
            <form onSubmit={handleSubmit} className="text-left space-y-4 mb-8">
              <p className="text-gray-400 font-heading text-sm">Complete your application before an admin or co-admin can review your request.</p>
              <input required placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none clip-tactical" />
              <input required placeholder="Free Fire ID" value={form.gameId} onChange={(e) => setForm({ ...form, gameId: e.target.value })} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none clip-tactical" />
              <textarea placeholder="Tell us about your play style" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} rows={3} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:border-neon-500/50 focus:outline-none clip-tactical resize-none" />
              <label className="flex items-center gap-3 px-4 py-3 border border-dashed border-tactical-600 text-tactical-200 cursor-pointer">
                <Upload size={18} className="text-neon-400" /><span className="font-heading text-sm truncate">{form.imageName || 'Upload profile image'}</span>
                <input required type="file" accept="image/*" className="sr-only" onChange={(e) => setForm({ ...form, imageName: e.target.files?.[0]?.name || '' })} />
              </label>
              <label className="flex gap-3 items-start text-sm text-gray-400 font-heading cursor-pointer"><input type="checkbox" checked={form.acceptedTerms} onChange={(e) => setForm({ ...form, acceptedTerms: e.target.checked })} className="mt-1 accent-neon-500" /> I agree to the guild terms and conditions.</label>
              <button type="submit" className="btn-neon w-full flex items-center justify-center gap-2"><FileImage size={16} /> Submit Join Request</button>
            </form>
          )}

          {submitted && <div className="font-mono text-sm text-tactical-300 mb-6 space-y-1">
            <div>REQUEST ID: #{member?.discordId}</div>
            <div>STATUS: <span className="text-warning-400">AWAITING ADMIN REVIEW</span></div>
            <div>SUBMITTED: {member?.joinDate}</div>
          </div>}

          {submitted && <p className="text-gray-400 font-heading text-base leading-relaxed mb-8">
            Your access request has been submitted and is now waiting for approval from the Guild Admin.
            You will be notified once your request has been reviewed.
          </p>}

          {/* Progress indicator */}
          {submitted && <div className="flex items-center justify-center gap-2 mb-8">
            {['Request', 'Review', 'Approval', 'Access'].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 ${i <= 1 ? 'text-warning-400' : 'text-gray-600'}`}>
                  <div className={`w-3 h-3 rounded-full ${i <= 1 ? 'bg-warning-400' : 'bg-ink-600'}`} />
                  <span className="font-mono text-xs uppercase tracking-wider">{step}</span>
                </div>
                {i < 3 && <div className={`w-8 h-px ${i < 1 ? 'bg-warning-400/50' : 'bg-ink-600'}`} />}
              </div>
            ))}
          </div>}

          {submitted && <div className="flex items-center justify-center gap-2 text-tactical-300 font-mono text-xs mb-6">
            <ShieldQuestion size={14} />
            <span>Only Guild Admins can approve access requests</span>
          </div>}

          {!isAuthenticated && <button onClick={() => setView('landing')} className="btn-outline mx-auto">
            <LogIn size={16} className="inline mr-2" />
            Login with Discord
          </button>}
        </div>
      </div>
    </div>
  );
}
