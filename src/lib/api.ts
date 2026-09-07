export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const API_BASE = `${BACKEND_URL}/api`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

async function requestHealth() {
  return request<{ database: boolean; status: string }>('/health');
}

export const guildApi = {
  health: requestHealth,
  list: <T>(resource: 'members' | 'events' | 'announcements' | 'settings' | 'ranking-tasks' | 'ranking-scores') => request<T[]>(`/${resource}`),
  save: <T>(resource: 'members' | 'events' | 'announcements' | 'settings' | 'ranking-tasks' | 'ranking-scores', value: T) => request<T>(`/${resource}`, { method: 'POST', body: JSON.stringify(value) }),
  update: <T>(resource: 'members' | 'events' | 'announcements' | 'settings' | 'ranking-tasks' | 'ranking-scores', id: string, value: Partial<T>) => request<T>(`/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify(value) }),
  remove: (resource: 'members' | 'events' | 'announcements' | 'settings' | 'ranking-tasks' | 'ranking-scores', id: string) => request<void>(`/${resource}/${id}`, { method: 'DELETE' }),
};
