'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { MessageSquare, CalendarDays, Layers, LayoutDashboard, LogOut } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useSession, signOut } from 'next-auth/react';

gsap.registerPlugin(ScrollTrigger);

const features = [
  {
    icon: MessageSquare,
    title: 'AI-Powered Planning',
    description:
      'Describe your goal in plain language. The AI breaks it down into clear, actionable tasks and refines the plan as you chat.',
  },
  {
    icon: CalendarDays,
    title: 'Smart Calendar',
    description:
      'See all tasks across every plan in a unified calendar view. Due dates, time slots, and priorities at a glance.',
  },
  {
    icon: Layers,
    title: 'Multiple Plans',
    description:
      'Organise work, personal projects, and side goals into separate plans. Switch between them instantly.',
  },
];

export default function LandingPage() {
  const { data: session, status } = useSession();
  const isLoggedIn = status === 'authenticated';
  const userName = session?.user?.name ?? session?.user?.email ?? '';
  const initials = userName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const navRef = useRef<HTMLElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const subRef = useRef<HTMLParagraphElement>(null);
  const ctaBtnsRef = useRef<HTMLDivElement>(null);
  const featuresTitleRef = useRef<HTMLHeadingElement>(null);
  const featureCardsRef = useRef<HTMLDivElement>(null);
  const ctaBannerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // — Nav slide down
      gsap.from(navRef.current, {
        y: -60,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.out',
      });

      // — Hero stagger (badge → h1 → sub → buttons)
      const heroTl = gsap.timeline({ delay: 0.2 });
      heroTl
        .from(badgeRef.current, { y: 20, opacity: 0, duration: 0.5, ease: 'power2.out' })
        .from(headingRef.current, { y: 30, opacity: 0, duration: 0.6, ease: 'power3.out' }, '-=0.2')
        .from(subRef.current, { y: 20, opacity: 0, duration: 0.5, ease: 'power2.out' }, '-=0.3')
        .from(ctaBtnsRef.current, { y: 20, opacity: 0, duration: 0.5, ease: 'power2.out' }, '-=0.25');

      // — Features section title
      gsap.from(featuresTitleRef.current, {
        scrollTrigger: {
          trigger: featuresTitleRef.current,
          start: 'top 85%',
        },
        y: 30,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.out',
      });

      // — Feature cards stagger
      if (featureCardsRef.current) {
        const cards = featureCardsRef.current.querySelectorAll('.feature-card');
        gsap.from(cards, {
          scrollTrigger: {
            trigger: featureCardsRef.current,
            start: 'top 80%',
          },
          y: 50,
          opacity: 0,
          duration: 0.6,
          stagger: 0.15,
          ease: 'power3.out',
        });
      }

      // — CTA banner
      gsap.from(ctaBannerRef.current, {
        scrollTrigger: {
          trigger: ctaBannerRef.current,
          start: 'top 85%',
        },
        y: 40,
        opacity: 0,
        scale: 0.97,
        duration: 0.65,
        ease: 'power2.out',
      });

      // — Footer fade
      gsap.from(footerRef.current, {
        scrollTrigger: {
          trigger: footerRef.current,
          start: 'top 95%',
        },
        opacity: 0,
        duration: 0.5,
        ease: 'power1.out',
      });
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <header ref={navRef} className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="AI Todo" className="w-7 h-7 rounded-lg" />
            <span className="font-bold text-gray-900 text-lg">AI Todo</span>
          </div>
          <div className="flex items-center gap-3">
            {status === 'loading' ? (
              <div className="h-8 w-32 rounded-lg bg-gray-100 animate-pulse" />
            ) : isLoggedIn ? (
              <>
                {/* User avatar */}
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold select-none">
                  {initials || '?'}
                </div>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <div
          ref={badgeRef}
          className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6"
        >
          <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
          AI-powered task management
        </div>
        <h1
          ref={headingRef}
          className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight max-w-2xl mb-5"
        >
          Plan smarter.<br />
          <span className="text-indigo-600">Get more done.</span>
        </h1>
        <p ref={subRef} className="text-lg text-gray-500 max-w-xl mb-10">
          Tell the AI what you want to achieve. It builds your plan, tracks your progress,
          and adapts as things change — all in a single chat.
        </p>
        <div ref={ctaBtnsRef} className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/register"
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors shadow-sm"
          >
            Start for free
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold rounded-xl transition-colors"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 border-t border-gray-100 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2
            ref={featuresTitleRef}
            className="text-2xl font-bold text-gray-900 text-center mb-12"
          >
            Everything you need to stay on track
          </h2>
          <div ref={featureCardsRef} className="grid sm:grid-cols-3 gap-8">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="feature-card bg-white rounded-2xl p-6 border border-gray-100 shadow-sm"
              >
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section ref={ctaBannerRef} className="py-16 px-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready to get started?</h2>
        <p className="text-gray-500 mb-8">Create a free account and let AI handle the planning.</p>
        <Link
          href="/register"
          className="inline-block px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors shadow-sm"
        >
          Create free account
        </Link>
      </section>

      {/* Footer */}
      <footer ref={footerRef} className="border-t border-gray-100 py-6 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} AI Todo. Built with Next.js &amp; DeepSeek.
      </footer>
    </div>
  );
}
