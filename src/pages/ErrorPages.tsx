import { AlertTriangle, ArrowLeft, Home, ShieldAlert, SearchX } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

type ErrorPageProps = {
  code: '403' | '404' | '500';
  title: string;
  message: string;
  icon: typeof AlertTriangle;
};

export function ErrorPage({ code, title, message, icon: Icon }: ErrorPageProps) {
  const { setView } = useAuth();

  return (
    <div className="min-h-screen bg-ink-900 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl text-center">
        <div className="font-display text-7xl font-black text-neon-400 tracking-widest">{code}</div>
        <div className="mx-auto mt-6 flex h-16 w-16 items-center justify-center border border-neon-500/40 bg-neon-500/10">
          <Icon size={30} className="text-neon-400" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold uppercase tracking-wider text-white">{title}</h1>
        <p className="mx-auto mt-3 max-w-md font-heading text-base leading-relaxed text-gray-400">{message}</p>
        <div className="mt-8 flex justify-center gap-3">
          <button onClick={() => setView('lobby')} className="btn-neon inline-flex items-center gap-2">
            <Home size={16} /> Home
          </button>
          <button onClick={() => window.history.back()} className="btn-outline inline-flex items-center gap-2">
            <ArrowLeft size={16} /> Go Back
          </button>
        </div>
      </div>
    </div>
  );
}

export function ForbiddenPage() {
  return <ErrorPage code="403" title="Access Denied" message="You do not have permission to access this command center area." icon={ShieldAlert} />;
}

export function NotFoundPage() {
  return <ErrorPage code="404" title="Page Not Found" message="The requested guild sector does not exist or has moved." icon={SearchX} />;
}

export function ServerErrorPage() {
  return <ErrorPage code="500" title="System Error" message="The command center encountered an unexpected error. Return home and try again." icon={AlertTriangle} />;
}
