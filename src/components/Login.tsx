import React, { useState } from 'react';
import { LogIn, Mail, Lock, AlertCircle, GraduationCap, ShieldAlert, KeyRound, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Card, Field, TextInput, PrimaryButton } from './ui';

const formatCountdown = (secs: number): string => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const Login: React.FC = () => {
  const { login, resetPassword, lockoutRemaining, firebaseReady } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');

  const locked = lockoutRemaining > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked || busy) return;
    setError('');
    setBusy(true);
    const res = await login(email, password);
    setBusy(false);
    if (!res.ok) setError(res.error || 'Login failed.');
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetBusy) return;
    setResetError('');
    setResetBusy(true);
    const res = await resetPassword(email);
    setResetBusy(false);
    if (res.ok) setResetSent(true);
    else setResetError(res.error || 'Could not send the reset email.');
  };

  const enterResetMode = () => {
    setResetMode(true);
    setResetSent(false);
    setResetError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mb-3">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            School Management System
          </h1>
          <p className="text-sm text-indigo-200/80 mt-1">Sign in to your school portal</p>
        </div>

        <Card className="p-6 sm:p-8">
          {!firebaseReady && (
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Firebase is not configured yet. Paste your web-app config into
                <code className="font-mono"> src/config/firebase.ts</code> or the
                <code className="font-mono"> VITE_FIREBASE_*</code> env vars.
              </span>
            </div>
          )}

          {resetMode ? (
            resetSent ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-3 text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Password reset link sent to <strong>{email.trim()}</strong>. Check your
                    inbox (and spam folder) and follow the link to set a new password.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setResetMode(false)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 mx-auto"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="flex items-start gap-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2.5 text-xs text-indigo-800">
                  <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Enter your account email and we'll send you a link to reset your password.
                  </span>
                </div>

                <Field label="Email address">
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <TextInput
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@school.edu"
                      className="pl-9"
                      autoComplete="username"
                      disabled={resetBusy}
                      required
                    />
                  </div>
                </Field>

                {resetError && (
                  <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5 text-xs text-rose-700">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{resetError}</span>
                  </div>
                )}

                <PrimaryButton
                  type="submit"
                  className="w-full py-2.5 text-base"
                  disabled={resetBusy || !firebaseReady}
                >
                  {resetBusy ? (
                    <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <KeyRound className="w-4 h-4" />
                  )}
                  {resetBusy ? 'Sending…' : 'Send reset link'}
                </PrimaryButton>

                <button
                  type="button"
                  onClick={() => setResetMode(false)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 mx-auto"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to sign in
                </button>
              </form>
            )
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Email address">
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <TextInput
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                  className="pl-9"
                  autoComplete="username"
                  disabled={locked || busy}
                  required
                />
              </div>
            </Field>

            <Field label="Password">
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <TextInput
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9"
                  autoComplete="current-password"
                  disabled={locked || busy}
                  required
                />
              </div>
            </Field>

            <div className="flex justify-end -mt-2">
              <button
                type="button"
                onClick={enterResetMode}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Forgot password?
              </button>
            </div>

            {error && !locked && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5 text-xs text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {locked && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-sm font-bold text-amber-800">
                  <ShieldAlert className="w-4 h-4" />
                  Too many failed attempts
                </div>
                <div className="text-xs text-amber-700 mt-1">
                  Try again in <span className="font-bold tabular-nums">{formatCountdown(lockoutRemaining)}</span>
                </div>
              </div>
            )}

            <PrimaryButton
              type="submit"
              className="w-full py-2.5 text-base"
              disabled={locked || busy || !firebaseReady}
            >
              {busy ? (
                <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {busy ? 'Signing in…' : 'Sign in'}
            </PrimaryButton>
          </form>
          )}
        </Card>

        <p className="text-center text-[11px] text-indigo-200/50 mt-4">
          Sessions expire after 30 minutes of inactivity
        </p>
      </div>
    </div>
  );
};
