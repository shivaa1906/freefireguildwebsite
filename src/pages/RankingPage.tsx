import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { RankingTask } from '@/types';
import { GridBackground, ParticleField, ScanLines, Vignette } from '@/components/effects/VisualEffects';
import { Check, Medal, Plus, Trash2, Trophy } from 'lucide-react';

export function RankingPage() {
  const { member, members, rankingTasks, rankingScores, rankingError, createRankingTask, updateRankingTask, deleteRankingTask, awardRankingScore } = useAuth();
  const [taskDraft, setTaskDraft] = useState({ title: '', description: '', points: 10, trigger: 'manual' as RankingTask['trigger'] });
  const [awardDraft, setAwardDraft] = useState({ taskId: '', memberId: '', points: 0 });
  const [awardMemberSearch, setAwardMemberSearch] = useState('');
  const [awardMemberFocused, setAwardMemberFocused] = useState(false);
  const canManage = member?.role === 'admin' || member?.role === 'coadmin';
  const canUseRankings = member?.role === 'admin' || member?.role === 'coadmin' || member?.role === 'moderator' || member?.role === 'member';
  const ranking = members
    .map((item) => ({ member: item, points: rankingScores.filter((score) => score.memberId === item.id).reduce((total, score) => total + score.points, 0) }))
    .sort((a, b) => b.points - a.points || a.member.displayName.localeCompare(b.member.displayName));
  const approvedMembers = members.filter((item) => item.status === 'approved');
  const filteredAwardMembers = approvedMembers.filter((item) => item.displayName.toLowerCase().includes(awardMemberSearch.toLowerCase()));
  const completedTasks = rankingTasks.filter((task) => task.status === 'completed');

  if (!canUseRankings) {
    return <div className="min-h-screen bg-ink-900 flex items-center justify-center pt-16"><div className="text-center"><Medal size={48} className="text-alert-500 mx-auto mb-4" /><h1 className="font-display font-bold text-2xl text-white uppercase tracking-wider">Access Denied</h1><p className="font-mono text-sm text-gray-500 mt-2">RANKING ACCESS IS FOR GUILD MEMBERS ONLY</p></div></div>;
  }

  const createTask = () => {
    if (!taskDraft.title.trim() || taskDraft.points <= 0 || !member) return;
    createRankingTask({ id: `rank-task-${Date.now()}`, title: taskDraft.title.trim(), description: taskDraft.description.trim(), points: taskDraft.points, status: 'open', trigger: taskDraft.trigger, createdBy: member.id, createdAt: new Date().toISOString() });
    setTaskDraft({ title: '', description: '', points: 10, trigger: 'manual' });
  };

  const awardScore = () => {
    if (!awardDraft.taskId || !awardDraft.memberId || awardDraft.points <= 0 || !member) return;
    awardRankingScore({ id: `rank-score-${Date.now()}`, taskId: awardDraft.taskId, memberId: awardDraft.memberId, points: awardDraft.points, awardedBy: member.id, awardedAt: new Date().toISOString() });
    deleteRankingTask(awardDraft.taskId);
    setAwardDraft({ taskId: '', memberId: '', points: 0 });
    setAwardMemberSearch('');
    setAwardMemberFocused(false);
  };

  return (
    <div className="min-h-screen bg-ink-900 relative overflow-hidden pt-16">
      <GridBackground /><ParticleField count={30} /><ScanLines /><Vignette />
      <div className="relative z-10 px-4 md:px-8 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8"><div className="hud-label mb-1">GUILD PERFORMANCE · LIVE STANDINGS</div><h1 className="section-title text-3xl md:text-4xl">Rankings</h1></div>
          {rankingError && <div className="mb-6 border border-alert-500/40 bg-alert-500/10 px-4 py-3 font-mono text-xs text-alert-300">{rankingError}</div>}
          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6">
            <section className="glass-panel clip-tactical p-6">
              <div className="flex items-center gap-3 mb-5"><Medal size={22} className="text-neon-400" /><h2 className="font-heading font-bold text-white text-lg uppercase tracking-wider">Member leaderboard</h2></div>
              <div className="space-y-2">
                {ranking.map(({ member: rankedMember, points }, index) => (
                  <div key={rankedMember.id} className="tactical-card p-4 flex items-center gap-3">
                    <div className="w-8 font-display font-bold text-neon-400">#{index + 1}</div>
                    <img src={rankedMember.avatar} alt={rankedMember.displayName} className="w-9 h-9 rounded-full object-cover border border-neon-500/30" />
                    <div className="flex-1 min-w-0"><div className="font-heading font-bold text-white truncate">{rankedMember.displayName}</div><div className="font-mono text-xs text-gray-500">{rankedMember.discordName}</div></div>
                    <div className="font-display font-bold text-lg text-neon-300">{points} <span className="font-mono text-[10px] text-gray-500">PTS</span></div>
                  </div>
                ))}
              </div>
            </section>
            <section className="glass-panel clip-tactical p-6">
              <div className="flex items-center gap-3 mb-5"><Trophy size={22} className="text-neon-400" /><h2 className="font-heading font-bold text-white text-lg uppercase tracking-wider">Tasks</h2></div>
              <div className="space-y-2">
                {rankingTasks.length === 0 && <div className="font-mono text-xs text-gray-500">NO RANKING TASKS YET</div>}
                {rankingTasks.map((task) => <div key={task.id} className="p-3 border border-ink-600 bg-ink-800/30"><div className="flex items-center gap-2"><div className="font-heading font-semibold text-white flex-1">{task.title}</div><span className="font-mono text-xs text-neon-300">+{task.points}</span>{canManage && <button onClick={() => deleteRankingTask(task.id)} aria-label={`Delete ${task.title}`} className="text-gray-500 hover:text-alert-400"><Trash2 size={14} /></button>}</div><div className="font-mono text-xs text-gray-500 mt-1">{task.description || 'No description'} · {task.status.toUpperCase()} · {task.trigger === 'manual' ? 'MANUAL' : task.trigger === 'website-chat' ? 'AUTO: WEBSITE CHAT' : 'AUTO: DISCORD CHAT'}</div>{canManage && task.status === 'open' && task.trigger === 'manual' && <button onClick={() => updateRankingTask(task.id, { status: 'completed' })} className="mt-2 text-xs font-mono text-success-400 uppercase flex items-center gap-1"><Check size={13} /> Mark completed</button>}</div>)}
              </div>
            </section>
          </div>
          {canManage && <div className="grid lg:grid-cols-2 gap-6 mt-6">
              <section className="glass-panel clip-tactical p-6"><h2 className="font-heading font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2"><Plus size={18} className="text-neon-400" /> Create ranking task</h2><div className="space-y-3"><input value={taskDraft.title} onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })} placeholder="Task title" className="w-full px-3 py-2 bg-ink-800/50 border border-ink-600 text-white font-heading" /><textarea value={taskDraft.description} onChange={(event) => setTaskDraft({ ...taskDraft, description: event.target.value })} placeholder="Task description" rows={3} className="w-full px-3 py-2 bg-ink-800/50 border border-ink-600 text-white font-heading resize-none" /><input type="number" min="1" value={taskDraft.points} onChange={(event) => setTaskDraft({ ...taskDraft, points: Number(event.target.value) })} placeholder="Default points" className="w-full px-3 py-2 bg-ink-800/50 border border-ink-600 text-white font-heading" /><select value={taskDraft.trigger} onChange={(event) => setTaskDraft({ ...taskDraft, trigger: event.target.value as RankingTask['trigger'] })} className="w-full px-3 py-2 bg-ink-800/50 border border-ink-600 text-white font-heading"><option value="manual">Manual task completion</option><option value="website-chat">Automatic: website chat activity</option><option value="discord-message">Automatic: Discord chat activity</option></select><button onClick={createTask} className="btn-neon">Create task</button></div></section>
              <section className="glass-panel clip-tactical p-6"><h2 className="font-heading font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2"><Medal size={18} className="text-neon-400" /> Award score</h2><div className="space-y-3"><select value={awardDraft.taskId} onChange={(event) => { const task = completedTasks.find((item) => item.id === event.target.value); setAwardDraft({ ...awardDraft, taskId: event.target.value, points: task?.points || 0 }); }} className="w-full px-3 py-2 bg-ink-800/50 border border-ink-600 text-white font-heading"><option value="">Select completed task</option>{completedTasks.map((task) => <option key={task.id} value={task.id}>{task.title} (+{task.points})</option>)}</select><div className="relative"><input type="search" value={awardMemberSearch} onFocus={() => setAwardMemberFocused(true)} onBlur={() => setAwardMemberFocused(false)} onChange={(event) => { const value = event.target.value; const selectedMember = approvedMembers.find((item) => item.displayName.toLowerCase() === value.trim().toLowerCase()); setAwardMemberSearch(value); setAwardDraft({ ...awardDraft, memberId: selectedMember?.id || '' }); }} placeholder="Search or select member" className="w-full px-3 py-2 bg-ink-800/50 border border-ink-600 text-white font-heading placeholder-gray-500 focus:border-neon-500/50 focus:outline-none" />{awardMemberFocused && <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-scroll overscroll-contain border border-neon-500/40 bg-ink-900 shadow-xl">{filteredAwardMembers.length > 0 ? filteredAwardMembers.map((item) => <button key={item.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setAwardMemberSearch(item.displayName); setAwardDraft({ ...awardDraft, memberId: item.id }); setAwardMemberFocused(false); }} className="block w-full border-b border-ink-700 px-3 py-2 text-left font-heading text-sm text-gray-300 hover:bg-neon-500/15 hover:text-neon-300">{item.displayName}</button>) : <div className="px-3 py-3 font-mono text-xs text-gray-500">NO MEMBERS FOUND</div>}</div>}</div><input type="number" min="1" value={awardDraft.points} onChange={(event) => setAwardDraft({ ...awardDraft, points: Number(event.target.value) })} className="w-full px-3 py-2 bg-ink-800/50 border border-ink-600 text-white font-heading" /><button onClick={awardScore} className="btn-neon">Award points</button></div></section>
          </div>}
        </div>
      </div>
    </div>
  );
}