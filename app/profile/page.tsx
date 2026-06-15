'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import logo from '@/public/logo.png';
import {
  ArrowLeft, User, Mail, CalendarDays, Layers, CheckCircle2, Circle,
  Check, X, Loader2, LogOut, KeyRound, ShieldCheck,
} from 'lucide-react';

interface Profile {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  authMethod: 'credentials' | 'google';
  stats: {
    plans: number;
    totalTasks: number;
    completedTasks: number;
    pendingTasks: number;
  };
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { update } = useSession();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Name editing
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/profile')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `Request failed: ${r.status}`);
        return r.json();
      })
      .then((data: Profile) => setProfile(data))
      .catch((e) => setLoadError(e.message ?? 'Could not load your profile.'))
      .finally(() => setLoading(false));
  }, []);

  const startEditName = () => {
    if (!profile) return;
    setNameDraft(profile.name);
    setNameError('');
    setEditingName(true);
  };

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = nameDraft.trim();
    if (!trimmed) { setNameError('Name is required.'); return; }
    if (trimmed === profile?.name) { setEditingName(false); return; }

    setSavingName(true);
    setNameError('');
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not update your name.');

      setProfile((p) => (p ? { ...p, name: data.name } : p));
      // Propagate to the NextAuth session so the sidebar avatar/name refresh.
      await update({ name: data.name });
      setEditingName(false);
    } catch (e) {
      setNameError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSavingName(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword.length < 6) { setPasswordError('New password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('New passwords do not match.'); return; }

    setSavingPassword(true);
    try {
      const res = await fetch('/api/profile/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not change your password.');

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSavingPassword(false);
    }
  };

  const initials = (profile?.name ?? profile?.email ?? '')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const memberSince = profile
    ? new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Logo — matches the dashboard sidebar header */}
          <Link href="/dashboard" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo.src} alt="AI Todo" className="w-6 h-6 rounded-md" />
            <span className="text-xl font-bold text-gray-800">AI Todo</span>
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> Back to app
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Your Profile</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading profile…
          </div>
        ) : loadError ? (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {loadError}
          </div>
        ) : profile ? (
          <>
            {/* Identity card */}
            <section className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xl font-bold shrink-0 select-none">
                  {initials || '?'}
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-gray-900 truncate">{profile.name}</p>
                  <p className="text-sm text-gray-500 truncate">{profile.email}</p>
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                    <ShieldCheck className="w-3 h-3" />
                    {profile.authMethod === 'google' ? 'Signed in with Google' : 'Email & password'}
                  </span>
                </div>
              </div>
            </section>

            {/* Stats */}
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={<Layers className="w-5 h-5" />} label="Plans" value={profile.stats.plans} />
              <StatCard icon={<Circle className="w-5 h-5" />} label="Pending tasks" value={profile.stats.pendingTasks} />
              <StatCard icon={<CheckCircle2 className="w-5 h-5" />} label="Completed" value={profile.stats.completedTasks} />
              <StatCard icon={<CalendarDays className="w-5 h-5" />} label="Total tasks" value={profile.stats.totalTasks} />
            </section>

            {/* Account details */}
            <section className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
              {/* Display name */}
              <div className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <User className="w-5 h-5 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-500">Display name</p>
                      {!editingName && <p className="text-sm text-gray-900 truncate">{profile.name}</p>}
                    </div>
                  </div>
                  {!editingName && (
                    <button
                      onClick={startEditName}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-700 shrink-0"
                    >
                      Edit
                    </button>
                  )}
                </div>

                {editingName && (
                  <form onSubmit={saveName} className="mt-3 flex items-start gap-2">
                    <div className="flex-1">
                      <input
                        type="text"
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        maxLength={255}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                        placeholder="Your name"
                      />
                      {nameError && <p className="text-xs text-red-600 mt-1">{nameError}</p>}
                    </div>
                    <button
                      type="submit"
                      disabled={savingName}
                      className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg transition shrink-0"
                      aria-label="Save name"
                    >
                      {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingName(false)}
                      disabled={savingName}
                      className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition shrink-0"
                      aria-label="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </form>
                )}
              </div>

              {/* Email (read-only) */}
              <div className="p-5 flex items-center gap-3">
                <Mail className="w-5 h-5 text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500">Email</p>
                  <p className="text-sm text-gray-900 truncate">{profile.email}</p>
                </div>
              </div>

              {/* Member since */}
              <div className="p-5 flex items-center gap-3">
                <CalendarDays className="w-5 h-5 text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500">Member since</p>
                  <p className="text-sm text-gray-900 truncate">{memberSince}</p>
                </div>
              </div>
            </section>

            {/* Change password — credentials accounts only */}
            {profile.authMethod === 'credentials' ? (
              <section className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <KeyRound className="w-5 h-5 text-gray-400" />
                  <h2 className="text-base font-semibold text-gray-900">Change password</h2>
                </div>

                <form onSubmit={changePassword} className="space-y-4">
                  {passwordError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                      {passwordError}
                    </div>
                  )}
                  {passwordSuccess && (
                    <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
                      <Check className="w-4 h-4" /> Password updated successfully.
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">Current password</label>
                    <input
                      type="password"
                      autoComplete="current-password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">New password</label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                      placeholder="At least 6 characters"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700">Confirm new password</label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                      placeholder="Re-enter new password"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="inline-flex items-center gap-2 py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {savingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                    {savingPassword ? 'Updating…' : 'Update password'}
                  </button>
                </form>
              </section>
            ) : (
              <section className="bg-white rounded-2xl border border-gray-200 p-6 flex items-start gap-3">
                <KeyRound className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Password</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    You sign in with Google, so your password is managed by your Google account.
                  </p>
                </div>
              </section>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
