import React, { useState } from 'react';
import { LogIn } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AuthGateProps {
  loading: boolean;
  onLocalAuth?: (username: string) => void;
}

const LOCAL_AUTH_USER = (import.meta.env.VITE_POS_AUTH_USER as string | undefined)?.trim();
const LOCAL_AUTH_PASS = (import.meta.env.VITE_POS_AUTH_PASS as string | undefined)?.trim();
const LOCAL_AUTH_ENABLED = Boolean(LOCAL_AUTH_USER && LOCAL_AUTH_PASS);

export function AuthGate({ loading, onLocalAuth }: AuthGateProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    const identifier = email.trim();
    const passwordValue = password.trim();
    if (!identifier || !passwordValue) {
      setError('Enter staff username/email and password.');
      return;
    }

    if (LOCAL_AUTH_ENABLED && identifier === LOCAL_AUTH_USER && passwordValue === LOCAL_AUTH_PASS) {
      onLocalAuth?.(identifier);
      return;
    }

    setSigningIn(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: identifier,
      password: passwordValue,
    });
    setSigningIn(false);

    if (signInError) {
      const hint = LOCAL_AUTH_ENABLED
        ? 'Use local POS username/password from .env.local or a valid Supabase staff email.'
        : 'Use a valid Supabase staff email/password.';
      setError(`${signInError.message || 'Unable to sign in.'} ${hint}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">POS Staff Login</h1>
          <p className="text-sm text-slate-500 mt-1">Use staff credentials to access POS operations.</p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
            <input
              type="text"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter username or staff email"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || signingIn}
            className="w-full h-11 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            {signingIn ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        {LOCAL_AUTH_ENABLED && (
          <p className="mt-4 text-xs text-slate-500">
            Local POS auth is enabled via <code>VITE_POS_AUTH_USER</code>/<code>VITE_POS_AUTH_PASS</code>.
          </p>
        )}
      </div>
    </div>
  );
}
