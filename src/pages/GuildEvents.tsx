import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { GuildEvent } from '@/types';
import { GridBackground, ParticleField, Vignette } from '@/components/effects/VisualEffects';
import { Trophy, Calendar, Clock, Users, CheckCircle2, Circle, XCircle, ChevronRight, Plus, X } from 'lucide-react';

const EVENT_TYPES: Record<GuildEvent['type'], { label: string; color: string }> = {
  'custom-match': { label: 'Custom Match', color: 'text-neon-400' },
  tournament: { label: 'Tournament', color: 'text-alert-400' },
  practice: { label: 'Practice', color: 'text-tactical-200' },
  scrim: { label: 'Scrim', color: 'text-success-400' },
  recruitment: { label: 'Recruitment', color: 'text-warning-400' },
};

const STATUS_CONFIG: Record<GuildEvent['status'], { label: string; color: string; icon: typeof Circle }> = {
  upcoming: { label: 'Upcoming', color: 'text-tactical-200', icon: Circle },
  live: { label: 'Live Now', color: 'text-alert-400', icon: Circle },
  completed: { label: 'Completed', color: 'text-gray-500', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'text-alert-500', icon: XCircle },
};

export function GuildEvents() {
  const { member, events, members, createEvent, composerTarget, clearComposer } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ name: '', date: '', time: '', description: '' });
  const [filter, setFilter] = useState<'all' | GuildEvent['status']>('all');
  const [selectedEvent, setSelectedEvent] = useState<GuildEvent | null>(null);

  useEffect(() => {
    if (composerTarget !== 'event') return;
    setShowCreate(true);
    clearComposer();
  }, [composerTarget, clearComposer]);

  const filteredEvents = events.filter((event) => filter === 'all' || event.status === filter);
  const filters: { value: 'all' | GuildEvent['status']; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'upcoming', label: 'Upcoming' },
    { value: 'live', label: 'Live' },
    { value: 'completed', label: 'Completed' },
  ];

  const getMember = (id: string) => members.find((m) => m.id === id);

  const submitEvent = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name || !draft.date || !draft.time) return;
    createEvent({ id: `e-${Date.now()}`, ...draft, type: 'custom-match', participantLimit: 12, participants: [], status: 'upcoming' });
    setDraft({ name: '', date: '', time: '', description: '' });
    setShowCreate(false);
  };

  return (
    <div className="min-h-screen bg-ink-900 relative overflow-hidden pt-16">
      <GridBackground />
      <ParticleField count={30} />
      <Vignette />

      <div className="relative z-10 px-4 md:px-8 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-4 mb-8 animate-fade-in-down">
            <div>
              <div className="hud-label mb-1">GUILD ACTIVITIES · EVENT ARENA</div>
              <h1 className="section-title text-3xl md:text-4xl">Guild Events</h1>
            </div>
            {(member?.role === 'admin' || member?.role === 'coadmin') && <button onClick={() => setShowCreate(!showCreate)} className="btn-neon flex items-center gap-2">
              <Plus size={18} />
              Create Event
            </button>}
          </div>

          {showCreate && <form onSubmit={submitEvent} className="glass-panel clip-tactical p-5 mb-6 space-y-3">
            <div className="flex justify-between items-center"><h2 className="font-heading font-bold text-white uppercase">Create Event</h2><button type="button" onClick={() => setShowCreate(false)} className="text-gray-500"><X size={18} /></button></div>
            <input required placeholder="Event name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:outline-none" />
            <div className="grid grid-cols-2 gap-3"><input required type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:outline-none" /><input required type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} className="px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:outline-none" /></div>
            <textarea placeholder="Event description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={3} className="w-full px-4 py-3 bg-ink-800/60 border border-tactical-700/40 text-white font-heading focus:outline-none resize-none" />
            <button className="btn-neon">Publish Event</button>
          </form>}

          {/* Filters */}
          <div className="flex items-center gap-2 mb-6 animate-fade-in-up">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-4 py-2 font-heading font-semibold text-xs uppercase tracking-wider transition-all clip-tactical ${
                  filter === f.value
                    ? 'bg-neon-500/20 text-neon-300 border border-neon-500/40'
                    : 'text-gray-500 border border-tactical-700/30 hover:text-tactical-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Events grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredEvents.map((event, i) => {
              const typeConfig = EVENT_TYPES[event.type];
              const statusConfig = STATUS_CONFIG[event.status];
              const StatusIcon = statusConfig.icon;
              return (
                <div
                  key={event.id}
                  onClick={() => setSelectedEvent(event)}
                  className="tactical-card p-5 cursor-pointer group animate-fade-in-up corner-brackets"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-10 h-10 flex items-center justify-center bg-ink-800/50`}>
                        <Trophy size={20} className={typeConfig.color} />
                      </div>
                      <div>
                        <div className={`font-mono text-[10px] uppercase tracking-widest ${typeConfig.color}`}>
                          {typeConfig.label}
                        </div>
                        <div className={`flex items-center gap-1.5 font-mono text-xs ${statusConfig.color}`}>
                          <StatusIcon size={12} className={event.status === 'live' ? 'animate-pulse fill-current' : ''} />
                          <span className="uppercase">{statusConfig.label}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-600 group-hover:text-neon-400 group-hover:translate-x-1 transition-all" />
                  </div>

                  <h3 className="font-display font-bold text-xl text-white tracking-wide mb-2">{event.name}</h3>
                  <p className="text-gray-400 font-heading text-sm leading-relaxed mb-4 line-clamp-2">{event.description}</p>

                  <div className="flex items-center gap-4 font-mono text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar size={12} />
                      <span>{event.date}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      <span>{event.time}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users size={12} />
                      <span>{event.participants.length}/{event.participantLimit}</span>
                    </div>
                  </div>

                  {/* Participants */}
                  <div className="flex items-center gap-1 mt-3 pt-3 border-t border-ink-600">
                    {event.participants.slice(0, 5).map((pid) => {
                      const m = getMember(pid);
                      return m ? (
                        <img key={pid} src={m.avatar} alt={m.displayName} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(m.displayName)}&background=f5a623&color=111827&size=200`; }} className="w-6 h-6 rounded-full border border-ink-600 object-cover" />
                      ) : null;
                    })}
                    {event.participants.length > 5 && (
                      <div className="w-6 h-6 rounded-full bg-ink-700 border border-ink-600 flex items-center justify-center font-mono text-[10px] text-gray-500">
                        +{event.participants.length - 5}
                      </div>
                    )}
                    <div className="ml-auto font-mono text-xs text-gray-500">
                      {event.participantLimit - event.participants.length} SLOTS LEFT
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredEvents.length === 0 && (
            <div className="text-center py-20">
              <div className="font-mono text-sm text-gray-500">NO EVENTS FOUND</div>
            </div>
          )}
        </div>
      </div>

      {/* Event detail modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setSelectedEvent(null)}>
          <div className="absolute inset-0 bg-ink-900/80 backdrop-blur-sm" />
          <div
            className="relative glass-panel clip-tactical-lg p-8 max-w-lg w-full animate-scale-in max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 flex items-center justify-center bg-ink-800/50">
                <Trophy size={24} className={EVENT_TYPES[selectedEvent.type].color} />
              </div>
              <div>
                <div className={`font-mono text-xs uppercase tracking-widest ${EVENT_TYPES[selectedEvent.type].color}`}>
                  {EVENT_TYPES[selectedEvent.type].label}
                </div>
                <h3 className="font-display font-bold text-2xl text-white tracking-wide">{selectedEvent.name}</h3>
              </div>
            </div>

            <p className="text-gray-400 font-heading text-base leading-relaxed mb-6">{selectedEvent.description}</p>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="p-3 bg-ink-800/50 border border-ink-600">
                <Calendar size={16} className="text-neon-400 mb-1" />
                <div className="font-mono text-xs text-gray-500">DATE</div>
                <div className="font-heading font-semibold text-sm text-white">{selectedEvent.date}</div>
              </div>
              <div className="p-3 bg-ink-800/50 border border-ink-600">
                <Clock size={16} className="text-neon-400 mb-1" />
                <div className="font-mono text-xs text-gray-500">TIME</div>
                <div className="font-heading font-semibold text-sm text-white">{selectedEvent.time}</div>
              </div>
              <div className="p-3 bg-ink-800/50 border border-ink-600">
                <Users size={16} className="text-neon-400 mb-1" />
                <div className="font-mono text-xs text-gray-500">SLOTS</div>
                <div className="font-heading font-semibold text-sm text-white">{selectedEvent.participants.length}/{selectedEvent.participantLimit}</div>
              </div>
            </div>

            <div className="mb-6">
              <div className="font-mono text-xs text-gray-500 uppercase tracking-widest mb-2">Participants</div>
              <div className="flex flex-wrap gap-2">
                {selectedEvent.participants.map((pid) => {
                  const m = getMember(pid);
                  return m ? (
                    <div key={pid} className="flex items-center gap-2 px-2 py-1 bg-ink-800/50 border border-ink-600">
                      <img src={m.avatar} alt={m.displayName} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(m.displayName)}&background=f5a623&color=111827&size=200`; }} className="w-5 h-5 rounded-full object-cover" />
                      <span className="font-heading text-xs text-tactical-200">{m.displayName}</span>
                    </div>
                  ) : null;
                })}
              </div>
            </div>

            <div className="flex gap-3">
              {selectedEvent.status === 'upcoming' && (
                <button className="btn-neon flex-1">Join Event</button>
              )}
              {selectedEvent.status === 'live' && (
                <button className="btn-neon flex-1">Enter Match</button>
              )}
              <button onClick={() => setSelectedEvent(null)} className="btn-outline">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
