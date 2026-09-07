import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { Announcement } from '@/types';
import { GridBackground, ParticleField, Vignette } from '@/components/effects/VisualEffects';
import { Megaphone, Calendar, ChevronRight, Pin, Plus, X, Pencil, Trash2 } from 'lucide-react';

const CATEGORY_CONFIG: Record<Announcement['category'], { label: string; color: string; bg: string }> = {
  match: { label: 'Match', color: 'text-neon-300', bg: 'bg-neon-500/10 border-neon-500/30' },
  rules: { label: 'Rules', color: 'text-alert-400', bg: 'bg-alert-500/10 border-alert-500/30' },
  event: { label: 'Event', color: 'text-success-400', bg: 'bg-success-500/10 border-success-500/30' },
  recruitment: { label: 'Recruitment', color: 'text-tactical-200', bg: 'bg-tactical-500/10 border-tactical-500/30' },
  update: { label: 'Update', color: 'text-warning-400', bg: 'bg-warning-500/10 border-warning-500/30' },
};

export function Announcements() {
  const { member, announcements: allAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, composerTarget, clearComposer } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [filter, setFilter] = useState<'all' | 'featured' | Announcement['category']>('all');
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [editDraft, setEditDraft] = useState({ title: '', content: '' });
  const canManage = member?.role === 'admin' || member?.role === 'coadmin';

  useEffect(() => {
    if (composerTarget !== 'announcement') return;
    setShowCreate(true);
    clearComposer();
  }, [composerTarget, clearComposer]);

  const announcements = allAnnouncements.filter((a) => {
    if (filter === 'all') return true;
    if (filter === 'featured') return a.featured;
    return a.category === filter;
  });

  const submitAnnouncement = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.title || !draft.content || !member) return;
    createAnnouncement({ id: `a-${Date.now()}`, ...draft, author: member.displayName, date: new Date().toISOString().slice(0, 10), featured: false, category: 'update' });
    setDraft({ title: '', content: '' });
    setShowCreate(false);
  };

  const filters: { value: typeof filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'featured', label: 'Featured' },
    { value: 'event', label: 'Events' },
    { value: 'match', label: 'Matches' },
    { value: 'rules', label: 'Rules' },
    { value: 'recruitment', label: 'Recruitment' },
  ];

  return (
    <div className="min-h-screen bg-ink-900 relative overflow-hidden pt-16">
      <GridBackground />
      <ParticleField count={30} />
      <Vignette />

      <div className="relative z-10 px-4 md:px-8 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-4 mb-8 animate-fade-in-down">
            <div>
              <div className="hud-label mb-1">COMMAND CENTER · BROADCAST</div>
              <h1 className="section-title text-3xl md:text-4xl">Announcements</h1>
            </div>
            {(member?.role === 'admin' || member?.role === 'coadmin') && <button onClick={() => setShowCreate(!showCreate)} className="btn-neon flex items-center gap-2">
              <Plus size={18} />
              New Announcement
            </button>}
          </div>

          {showCreate && <form onSubmit={submitAnnouncement} className="glass-panel clip-tactical p-5 mb-6 space-y-3">
            <div className="flex justify-between items-center"><h2 className="font-heading font-bold text-white uppercase">New Announcement</h2><button type="button" onClick={() => setShowCreate(false)} className="text-gray-500"><X size={18} /></button></div>
            <input required placeholder="Announcement title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:outline-none" />
            <textarea required placeholder="Announcement content" value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} rows={3} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:outline-none resize-none" />
            <button className="btn-neon">Publish Announcement</button>
          </form>}

          {/* Filters */}
          <div className="flex items-center gap-2 mb-6 animate-fade-in-up overflow-x-auto pb-1">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-4 py-2 font-heading font-semibold text-xs uppercase tracking-wider whitespace-nowrap transition-all clip-tactical ${
                  filter === f.value
                    ? 'bg-neon-500/20 text-neon-300 border border-neon-500/40'
                    : 'text-gray-500 border border-tactical-700/30 hover:text-tactical-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Announcements list */}
          <div className="space-y-4">
            {announcements.map((ann, i) => {
              const cat = CATEGORY_CONFIG[ann.category];
              return (
                <div
                  key={ann.id}
                  onClick={() => setSelected(ann)}
                  className="tactical-card p-6 cursor-pointer group animate-fade-in-up"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-ink-800/50">
                      <Megaphone size={22} className={cat.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {ann.featured && (
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-neon-500/15 border border-neon-500/30 font-mono text-[10px] text-neon-300 uppercase tracking-wider">
                            <Pin size={10} />
                            Featured
                          </div>
                        )}
                        <div className={`px-2 py-0.5 border font-mono text-[10px] uppercase tracking-wider ${cat.bg} ${cat.color}`}>
                          {cat.label}
                        </div>
                        <div className="flex items-center gap-1 font-mono text-xs text-gray-500">
                          <Calendar size={12} />
                          <span>{ann.date}</span>
                        </div>
                      </div>
                      <h3 className="font-display font-bold text-xl text-white tracking-wide mb-2 group-hover:text-neon-300 transition-colors">
                        {ann.title}
                      </h3>
                      <p className="text-gray-400 font-heading text-sm leading-relaxed line-clamp-2">{ann.content}</p>
                      <div className="flex items-center gap-2 mt-3 font-mono text-xs text-tactical-300">
                        <span>by {ann.author}</span>
                        <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                    {canManage && <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                      <button onClick={() => { setEditing(ann); setEditDraft({ title: ann.title, content: ann.content }); }} className="p-2 text-gray-500 hover:text-neon-400" title="Edit announcement" aria-label="Edit announcement"><Pencil size={16} /></button>
                      <button onClick={() => { if (window.confirm('Delete this announcement?')) deleteAnnouncement(ann.id); }} className="p-2 text-gray-500 hover:text-alert-400" title="Delete announcement" aria-label="Delete announcement"><Trash2 size={16} /></button>
                    </div>}
                  </div>
                </div>
              );
            })}
          </div>

          {announcements.length === 0 && (
            <div className="text-center py-20">
              <div className="font-mono text-sm text-gray-500">NO ANNOUNCEMENTS FOUND</div>
            </div>
          )}
        </div>
      </div>

      {editing && <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setEditing(null)}>
        <div className="absolute inset-0 bg-ink-900/80 backdrop-blur-sm" />
        <form onSubmit={(event) => { event.preventDefault(); updateAnnouncement(editing.id, editDraft); setEditing(null); }} className="relative glass-panel clip-tactical-lg p-8 max-w-2xl w-full space-y-4" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between"><h3 className="font-display font-bold text-xl text-white uppercase">Edit Announcement</h3><button type="button" onClick={() => setEditing(null)} className="text-gray-500 hover:text-white"><X size={20} /></button></div>
          <input required value={editDraft.title} onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:outline-none" />
          <textarea required rows={5} value={editDraft.content} onChange={(event) => setEditDraft({ ...editDraft, content: event.target.value })} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:outline-none resize-none" />
          <div className="flex gap-3"><button type="submit" className="btn-neon">Save Changes</button><button type="button" onClick={() => setEditing(null)} className="btn-outline">Cancel</button></div>
        </form>
      </div>}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-ink-900/80 backdrop-blur-sm" />
          <div
            className="relative glass-panel clip-tactical-lg p-8 max-w-2xl w-full animate-scale-in max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-ink-800/50">
                <Megaphone size={24} className={CATEGORY_CONFIG[selected.category].color} />
              </div>
              <div>
                <div className={`font-mono text-xs uppercase tracking-widest ${CATEGORY_CONFIG[selected.category].color}`}>
                  {CATEGORY_CONFIG[selected.category].label}
                </div>
                <h3 className="font-display font-bold text-2xl text-white tracking-wide">{selected.title}</h3>
              </div>
            </div>
            <div className="flex items-center gap-3 font-mono text-xs text-gray-500 mb-6">
              <span>by {selected.author}</span>
              <span>·</span>
              <span>{selected.date}</span>
            </div>
            <p className="text-gray-300 font-heading text-base leading-relaxed mb-6">{selected.content}</p>
            <button onClick={() => setSelected(null)} className="btn-outline">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
