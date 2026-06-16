'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import logo from '@/public/logo.png';
import { ArrowLeft, Sparkles, Loader2, Check, LogOut } from 'lucide-react';

const MAX_CONTEXT_LENGTH = 4000;

const PLACEHOLDER = `Share anything that helps the assistant tailor your plans, for example:

• Where you're based (city / home address) so it can suggest nearby places and realistic travel time
• Your work hours and typical daily routine
• People you plan around (family, kids, pets)
• Dietary needs, health considerations, or accessibility needs
• Tools, gym, or subscriptions you already have
• Goals and preferences (e.g. "I prefer mornings", "no meetings on Fridays")`;

const EXAMPLES = [
  'I live in Birmingham city centre and don\'t own a car.',
  'I work 9–6 on weekdays and prefer to run errands on weekends.',
  'I\'m vegetarian and a member of PureGym.',
  'I have two kids in primary school, so evenings are busy.',
];

export default function PersonalContextPage() {
  const router = useRouter();
  const [context, setContext] = useState('');
  const [savedContext, setSavedContext] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/profile/context')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `Request failed: ${r.status}`);
        return r.json();
      })
      .then((data: { personalContext: string }) => {
        setContext(data.personalContext ?? '');
        setSavedContext(data.personalContext ?? '');
      })
      .catch((e) => setLoadError(e.message ?? 'Could not load your personal context.'))
      .finally(() => setLoading(false));
  }, []);

  const dirty = context.trim() !== savedContext.trim();

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError('');
    setSaveSuccess(false);
    setSaving(true);
    try {
      const res = await fetch('/api/profile/context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalContext: context }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not save your personal context.');

      setSavedContext(data.personalContext ?? '');
      setContext(data.personalContext ?? '');
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
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
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors mb-3"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-500" />
            <h1 className="text-2xl font-bold text-gray-900">Personal Context</h1>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Tell the AI assistant about yourself. This information is sent along with your
            conversations so it can generate plans tailored to your life — your location,
            schedule, preferences, and constraints. It&apos;s only used to personalise your plans.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading your context…
          </div>
        ) : loadError ? (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {loadError}
          </div>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-3">
              {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {saveError}
                </div>
              )}
              {saveSuccess && !dirty && (
                <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
                  <Check className="w-4 h-4" /> Personal context saved.
                </div>
              )}

              <label htmlFor="personal-context" className="block text-sm font-medium text-gray-700">
                About you
              </label>
              <textarea
                id="personal-context"
                value={context}
                onChange={(e) => { setContext(e.target.value); setSaveSuccess(false); }}
                maxLength={MAX_CONTEXT_LENGTH}
                rows={12}
                placeholder={PLACEHOLDER}
                className="w-full px-3.5 py-3 border border-gray-300 rounded-xl text-sm text-gray-900 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition placeholder:text-gray-400"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  {context.length.toLocaleString()} / {MAX_CONTEXT_LENGTH.toLocaleString()} characters
                </p>
                <button
                  type="submit"
                  disabled={saving || !dirty}
                  className="inline-flex items-center gap-2 py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Saving…' : 'Save context'}
                </button>
              </div>
            </section>

            {/* Quick-add example chips */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">Need ideas?</h2>
              <p className="text-xs text-gray-500 mb-3">Tap an example to add it to your context.</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setContext((prev) => (prev.trim() ? `${prev.trim()}\n${ex}` : ex));
                      setSaveSuccess(false);
                    }}
                    className="text-left text-xs text-gray-600 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 border border-gray-200 hover:border-indigo-200 rounded-full px-3 py-1.5 transition-colors"
                  >
                    + {ex}
                  </button>
                ))}
              </div>
            </section>
          </form>
        )}
      </main>
    </div>
  );
}
