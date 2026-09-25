import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { guildApi } from '@/lib/api';
import type { GuildEvent, Tournament, TournamentBracket, TournamentMatch, TournamentParticipant, TournamentResult, TournamentStanding, TournamentTeam } from '@/types';
import { Calendar, Check, Edit3, Flag, GitBranch, Plus, RefreshCw, ShieldAlert, Trophy, Users } from 'lucide-react';

type MatchPage = { items: TournamentMatch[]; page: number; limit: number; total: number; pages: number };
type Draft = {
  name: string;
  description: string;
  gameMode: string;
  teamSize: number;
  maxTeams: number;
  registrationOpenAt: string;
  registrationCloseAt: string;
  startAt: string;
  endAt: string;
  eventId: string;
};

const emptyDraft: Draft = {
  name: '',
  description: '',
  gameMode: 'Squad',
  teamSize: 4,
  maxTeams: 8,
  registrationOpenAt: '',
  registrationCloseAt: '',
  startAt: '',
  endAt: '',
  eventId: '',
};

export function TournamentAdminPanel() {
  const { events, createEvent } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selected, setSelected] = useState<Tournament | null>(null);
  const [participants, setParticipants] = useState<TournamentParticipant[]>([]);
  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [bracket, setBracket] = useState<TournamentBracket | null>(null);
  const [standings, setStandings] = useState<TournamentStanding[]>([]);
  const [results, setResults] = useState<Record<string, TournamentResult[]>>({});
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editDraft, setEditDraft] = useState({ name: '', description: '', gameMode: '' });
  const [eventDraft, setEventDraft] = useState({ name: '', date: '', time: '18:00', description: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const tournamentEvents = useMemo(() => events.filter((event) => event.type === 'tournament'), [events]);

  const loadTournaments = async () => {
    setLoading(true);
    setMessage('');
    try {
      setTournaments(await guildApi.tournaments<Tournament>());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tournament records could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const loadSelected = async (tournament: Tournament) => {
    setSelected(tournament);
    setEditDraft({ name: tournament.name, description: tournament.description, gameMode: tournament.gameMode });
    setLoading(true);
    setMessage('');

    try {
      const [participantRows, teamRows, bracketRecord, matchPage, standingPage] = await Promise.all([
        guildApi.tournamentParticipants<TournamentParticipant>(tournament.id),
        guildApi.tournamentTeams<TournamentTeam>(tournament.id),
        guildApi.tournamentBracket<TournamentBracket>(tournament.id).catch(() => null),
        guildApi.tournamentMatches<MatchPage>(tournament.id),
        guildApi.tournamentStandings<{ items: TournamentStanding[] }>(tournament.id),
      ]);

      setParticipants(participantRows);
      setTeams(teamRows);
      setBracket(bracketRecord);
      setMatches(matchPage.items || []);
      setStandings(standingPage.items || []);

      const resultRows = await Promise.all(
        (matchPage.items || []).map(async (match) => [match.id, await guildApi.tournamentMatchResults<TournamentResult>(tournament.id, match.id)] as const),
      );
      setResults(Object.fromEntries(resultRows));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tournament details could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTournaments();
  }, []);

  const createTournament = async () => {
    if (!draft.eventId || !draft.name.trim() || !draft.registrationOpenAt || !draft.registrationCloseAt || !draft.startAt || !draft.endAt) {
      setMessage('Choose a linked tournament event and complete all required tournament details.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const created = await guildApi.createTournament<Tournament>({
        eventId: draft.eventId,
        name: draft.name,
        description: draft.description,
        format: 'single_elimination',
        gameMode: draft.gameMode,
        teamSize: draft.teamSize,
        maxTeams: draft.maxTeams,
        registrationOpenAt: draft.registrationOpenAt,
        registrationCloseAt: draft.registrationCloseAt,
        startAt: draft.startAt,
        endAt: draft.endAt,
        scoringRules: {},
        rankingIntegration: { enabled: false },
      });

      setDraft(emptyDraft);
      await loadTournaments();
      await loadSelected(created);
      setMessage('Tournament created successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tournament could not be created.');
    } finally {
      setLoading(false);
    }
  };

  const createTournamentEvent = () => {
    if (!eventDraft.name.trim() || !eventDraft.date || !eventDraft.time) {
      setMessage('Complete the event name, date, and time before linking it.');
      return;
    }

    const event: GuildEvent = {
      id: `event-${Date.now()}`,
      name: eventDraft.name.trim(),
      type: 'tournament',
      date: eventDraft.date,
      time: eventDraft.time,
      description: eventDraft.description.trim(),
      participantLimit: draft.maxTeams * draft.teamSize,
      participants: [],
      status: 'upcoming',
    };

    createEvent(event);
    setDraft((current) => ({ ...current, eventId: event.id }));
    setEventDraft({ name: '', date: '', time: '18:00', description: '' });
    setMessage('Tournament event linked and ready to use.');
  };

  const run = async (action: () => Promise<unknown>, success = 'Action completed.') => {
    if (!selected) return;
    setLoading(true);
    setMessage('');

    try {
      await action();
      setMessage(success);
      await loadTournaments();
      await loadSelected(selected);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tournament action failed.');
      setLoading(false);
    }
  };

  const updateStatus = (status: Tournament['status']) => void run(() => guildApi.updateTournamentStatus<Tournament>(selected!.id, status), `Tournament marked ${status}.`);
  const saveEdit = () => void run(() => guildApi.updateTournament<Tournament>(selected!.id, editDraft), 'Tournament details saved.');
  const teamName = (id: string | null) => teams.find((team) => team.id === id)?.name || (id ? 'Team' : 'BYE / TBD');

  return (
    <div className="space-y-5 animate-fade-in-up">
      {message && <div className="border border-alert-500/40 bg-alert-500/10 px-4 py-3 font-mono text-xs text-alert-300">{message}</div>}

      <div className="grid gap-5 lg:grid-cols-[0.78fr_1.22fr]">
        <section className="glass-panel clip-tactical p-5">
          <div className="mb-5 flex items-center gap-2">
            <Trophy size={18} className="text-neon-400" />
            <h3 className="font-heading font-bold uppercase tracking-wider text-white">Create Tournament</h3>
          </div>

          <div className="space-y-4">
            <div className="rounded border border-ink-600 bg-ink-900/40 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">Linked Guild Event</div>
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neon-300">Required</span>
              </div>

              <select
                value={draft.eventId}
                onChange={(event) => setDraft((current) => ({ ...current, eventId: event.target.value }))}
                className="w-full border border-ink-600 bg-ink-800/60 px-3 py-2.5 font-heading text-white"
              >
                <option value="">Select an existing guild event</option>
                {tournamentEvents.map((event) => (
                  <option key={event.id} value={event.id}>{event.name}</option>
                ))}
              </select>

              <p className="mt-2 font-mono text-[10px] text-gray-400">
                {tournamentEvents.length === 0
                  ? 'No tournament events are available yet. Create one below, then link it to this tournament.'
                  : 'Each tournament must be tied to the official guild event record for the correct schedule and roster.'}
              </p>
            </div>

            <div className="rounded border border-ink-600 bg-ink-900/40 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Plus size={14} className="text-neon-400" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">Create matching event</span>
              </div>

              <div className="grid gap-3">
                <TextField label="Event Name" value={eventDraft.name} onChange={(value) => setEventDraft({ ...eventDraft, name: value })} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <DateField label="Event Date" value={eventDraft.date} onChange={(value) => setEventDraft({ ...eventDraft, date: value })} />
                  <DateField label="Event Time" value={eventDraft.time} onChange={(value) => setEventDraft({ ...eventDraft, time: value })} isTime />
                </div>
                <TextAreaField label="Event Description" value={eventDraft.description} onChange={(value) => setEventDraft({ ...eventDraft, description: value })} rows={2} />
                <button type="button" onClick={createTournamentEvent} className="btn-outline w-full">Create event and link it</button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">Tournament Details</div>
              <TextField label="Tournament Name" value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
              <TextAreaField label="Description" value={draft.description} onChange={(value) => setDraft((current) => ({ ...current, description: value }))} rows={3} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Game Mode" value={draft.gameMode} onChange={(value) => setDraft((current) => ({ ...current, gameMode: value }))} />
              <SelectField label="Format" value="single_elimination" options={[{ value: 'single_elimination', label: 'Single Elimination' }]} onChange={() => undefined} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField label="Team Size" value={draft.teamSize} min={1} max={4} onChange={(value) => setDraft((current) => ({ ...current, teamSize: value }))} />
              <NumberField label="Maximum Teams" value={draft.maxTeams} min={2} max={256} onChange={(value) => setDraft((current) => ({ ...current, maxTeams: value }))} />
            </div>

            <div className="rounded border border-ink-600 bg-ink-900/40 p-4">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">Registration Window</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <DateField label="Opens" value={draft.registrationOpenAt} onChange={(value) => setDraft((current) => ({ ...current, registrationOpenAt: value }))} />
                <DateField label="Closes" value={draft.registrationCloseAt} onChange={(value) => setDraft((current) => ({ ...current, registrationCloseAt: value }))} />
              </div>
            </div>

            <div className="rounded border border-ink-600 bg-ink-900/40 p-4">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">Tournament Schedule</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <DateField label="Starts" value={draft.startAt} onChange={(value) => setDraft((current) => ({ ...current, startAt: value }))} />
                <DateField label="Ends" value={draft.endAt} onChange={(value) => setDraft((current) => ({ ...current, endAt: value }))} />
              </div>
            </div>

            <button disabled={loading} onClick={() => void createTournament()} className="btn-neon w-full disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Tournament'}
            </button>
          </div>
        </section>

        <section className="glass-panel clip-tactical p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Flag size={18} className="text-neon-400" />
              <h3 className="font-heading font-bold uppercase tracking-wider text-white">Tournament Records</h3>
            </div>
            <button onClick={() => void loadTournaments()} className="btn-outline inline-flex items-center gap-2">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {tournaments.length === 0 ? (
            <div className="rounded border border-ink-600 bg-ink-900/30 px-4 py-10 text-center">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500">No tournaments yet</div>
              <div className="mt-2 font-mono text-[10px] text-gray-400">Create your first tournament to get started.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {tournaments.map((tournament) => (
                <button
                  key={tournament.id}
                  onClick={() => void loadSelected(tournament)}
                  className={`w-full border p-3 text-left ${selected?.id === tournament.id ? 'border-neon-500/50 bg-neon-500/10' : 'border-ink-600 bg-ink-800/30'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-heading font-semibold text-white">{tournament.name}</span>
                    <span className="font-mono text-[10px] uppercase text-neon-300">{tournament.status}</span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-gray-500">{tournament.gameMode} · {tournament.teamSize}v{tournament.teamSize} · {tournament.maxTeams} max teams</div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {selected && (
        <section className="glass-panel clip-tactical p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="hud-label">SELECTED TOURNAMENT</div>
              <h3 className="mt-1 font-display text-2xl font-bold text-white">{selected.name}</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.status === 'draft' && <button onClick={() => updateStatus('registration_open')} className="btn-neon">Open registration</button>}
              {selected.status === 'registration_open' && <button onClick={() => updateStatus('registration_closed')} className="btn-outline">Close registration</button>}
              {selected.status === 'registration_closed' && <button onClick={() => updateStatus('active')} className="btn-neon">Activate</button>}
              {!['completed', 'cancelled'].includes(selected.status) && <button onClick={() => updateStatus('cancelled')} className="btn-outline text-alert-300">Cancel</button>}
              {selected.status === 'active' && <button onClick={() => updateStatus('completed')} className="btn-outline">Complete</button>}
            </div>
          </div>

          <div className="mt-5 grid gap-3 border-y border-ink-600 py-5 md:grid-cols-[1fr_1fr_auto]">
            <input value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} className="bg-ink-900/60 px-3 py-2 font-heading text-white" />
            <input value={editDraft.gameMode} onChange={(event) => setEditDraft({ ...editDraft, gameMode: event.target.value })} className="bg-ink-900/60 px-3 py-2 font-heading text-white" />
            <button onClick={saveEdit} disabled={loading} className="btn-outline inline-flex items-center justify-center gap-2 disabled:opacity-50"><Edit3 size={14} /> Save details</button>
            <textarea value={editDraft.description} onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })} rows={2} className="bg-ink-900/60 px-3 py-2 font-heading text-white md:col-span-3" />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <AdminList title="Participants" icon={Users}>
              {participants.map((participant) => (
                <div key={participant.id} className="flex items-center justify-between border-b border-ink-700 py-2">
                  <span className="font-mono text-xs text-gray-300">{participant.memberId}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase text-gray-500">{participant.status}</span>
                    {participant.status === 'registered' && <button onClick={() => void run(() => guildApi.updateTournamentParticipant(selected.id, participant.id, 'disqualified'), 'Participant disqualified.')} className="text-alert-300" aria-label="Disqualify participant"><ShieldAlert size={14} /></button>}
                    {participant.status === 'withdrawn' && <button onClick={() => void run(() => guildApi.updateTournamentParticipant(selected.id, participant.id, 'registered'), 'Participant restored.')} className="text-success-300" aria-label="Restore participant"><Check size={14} /></button>}
                  </div>
                </div>
              ))}
            </AdminList>

            <AdminList title="Teams" icon={Users}>
              {teams.map((team) => (
                <div key={team.id} className="flex items-center justify-between border-b border-ink-700 py-2">
                  <span className="font-heading text-sm text-white">{team.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase text-gray-500">{team.status}</span>
                    {team.status === 'active' && <button onClick={() => void run(() => guildApi.updateTournamentTeam(selected.id, team.id, { status: 'disbanded' }), 'Team disbanded.')} className="text-alert-300" aria-label="Disband team"><ShieldAlert size={14} /></button>}
                  </div>
                </div>
              ))}
            </AdminList>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-ink-600 pt-5">
            {!bracket && selected.status === 'registration_closed' && (
              <button onClick={() => void run(() => guildApi.generateTournamentBracket<TournamentBracket>(selected.id), 'Bracket generated.')} className="btn-neon inline-flex items-center gap-2"><GitBranch size={15} /> Generate bracket</button>
            )}
            {bracket && <span className="inline-flex items-center gap-2 border border-success-500/30 px-3 py-2 font-mono text-xs uppercase text-success-400"><Check size={14} /> Official bracket generated</span>}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <AdminList title="Matches and schedules" icon={Calendar}>
              {matches.map((match) => (
                <MatchAdminRow key={match.id} match={match} teamName={teamName} tournamentId={selected.id} onDone={() => void loadSelected(selected)} onError={setMessage} />
              ))}
            </AdminList>

            <AdminList title="Pending results" icon={Edit3}>
              {matches.flatMap((match) => (results[match.id] || []).filter((result) => result.status === 'pending').map((result) => (
                <ResultAdminRow key={result.id} result={result} match={match} tournamentId={selected.id} teamName={teamName} onDone={() => void loadSelected(selected)} onError={setMessage} />
              )))}
            </AdminList>
          </div>

          <AdminList title="Official standings" icon={Flag}>
            {standings.length === 0 ? (
              <div className="font-mono text-xs text-gray-500">No official standings yet.</div>
            ) : (
              standings.map((standing) => (
                <div key={standing.id} className="flex items-center justify-between border-b border-ink-700 py-2 font-mono text-xs">
                  <span className="text-white">{teamName(standing.teamId)}</span>
                  <span className="text-success-400">W {standing.wins}</span>
                  <span className="text-alert-300">L {standing.losses}</span>
                </div>
              ))
            )}
          </AdminList>
        </section>
      )}
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-ink-600 bg-ink-800/60 px-3 py-2 font-heading text-white"
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase text-gray-500">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="w-full border border-ink-600 bg-ink-800/60 px-3 py-2 font-heading text-white"
      />
    </label>
  );
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase text-gray-500">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || min)}
        className="w-full border border-ink-600 bg-ink-800/60 px-3 py-2 font-mono text-xs text-white"
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase text-gray-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full border border-ink-600 bg-ink-800/60 px-3 py-2 font-heading text-white">
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function DateField({ label, value, onChange, isTime = false }: { label: string; value: string; onChange: (value: string) => void; isTime?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase text-gray-500">{label}</span>
      <input
        type={isTime ? 'time' : 'datetime-local'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-ink-600 bg-ink-800/60 px-3 py-2 font-mono text-xs text-white"
      />
    </label>
  );
}

function AdminList({ title, icon: Icon, children }: { title: string; icon: typeof Users; children: React.ReactNode }) {
  return (
    <div className="border border-ink-600 bg-ink-800/20 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={16} className="text-neon-400" />
        <h4 className="font-heading font-bold uppercase text-white">{title}</h4>
      </div>
      <div className="max-h-72 overflow-y-auto">{children}</div>
    </div>
  );
}

function MatchAdminRow({ match, teamName, tournamentId, onDone, onError }: { match: TournamentMatch; teamName: (id: string | null) => string; tournamentId: string; onDone: () => void; onError: (message: string) => void }) {
  const [scheduledAt, setScheduledAt] = useState(match.scheduledAt ? match.scheduledAt.slice(0, 16) : '');

  return (
    <div className="border-b border-ink-700 py-3">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase text-gray-500">
        <span>R{match.round} M{match.matchNumber} · {teamName(match.participantA)} vs {teamName(match.participantB)}</span>
        <span>{match.status}</span>
      </div>
      {match.status !== 'completed' && match.status !== 'cancelled' && (
        <div className="mt-2 flex gap-2">
          <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="min-w-0 flex-1 bg-ink-900/60 px-2 py-1 font-mono text-[10px] text-white" />
          <button onClick={() => void guildApi.updateTournamentMatch(tournamentId, match.id, { scheduledAt, status: 'scheduled' }).then(onDone).catch((error: Error) => onError(error.message))} className="btn-outline px-2 py-1 text-[10px]">Schedule</button>
          <button onClick={() => void guildApi.updateTournamentMatch(tournamentId, match.id, { status: 'cancelled' }).then(onDone).catch((error: Error) => onError(error.message))} className="btn-outline px-2 py-1 text-[10px] text-alert-300">Cancel</button>
        </div>
      )}
    </div>
  );
}

function ResultAdminRow({ result, match, tournamentId, teamName, onDone, onError }: { result: TournamentResult; match: TournamentMatch; tournamentId: string; teamName: (id: string | null) => string; onDone: () => void; onError: (message: string) => void }) {
  const [scoreA, setScoreA] = useState(String(result.scoreA));
  const [scoreB, setScoreB] = useState(String(result.scoreB));
  const [winnerId, setWinnerId] = useState(result.winnerId);

  return (
    <div className="border-b border-ink-700 py-3">
      <div className="font-mono text-[10px] uppercase text-gray-500">{teamName(match.participantA)} vs {teamName(match.participantB)} · correction {result.correctionVersion}</div>
      <div className="mt-2 grid grid-cols-[1fr_1fr_1.5fr] gap-2">
        <input type="number" min="0" value={scoreA} onChange={(event) => setScoreA(event.target.value)} className="bg-ink-900/60 px-2 py-1 font-mono text-xs text-white" />
        <input type="number" min="0" value={scoreB} onChange={(event) => setScoreB(event.target.value)} className="bg-ink-900/60 px-2 py-1 font-mono text-xs text-white" />
        <select value={winnerId} onChange={(event) => setWinnerId(event.target.value)} className="bg-ink-900/60 px-2 py-1 font-mono text-xs text-white">
          <option value={match.participantA || ''}>{teamName(match.participantA)}</option>
          <option value={match.participantB || ''}>{teamName(match.participantB)}</option>
        </select>
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={() => void guildApi.correctTournamentResult(tournamentId, match.id, result.id, { scoreA: Number(scoreA), scoreB: Number(scoreB), winnerId }).then(onDone).catch((error: Error) => onError(error.message))} className="btn-outline px-2 py-1 text-[10px]">Correct</button>
        <button onClick={() => void guildApi.verifyTournamentResult(tournamentId, match.id, result.id).then(onDone).catch((error: Error) => onError(error.message))} className="btn-neon px-2 py-1 text-[10px]">Verify official</button>
      </div>
    </div>
  );
}
