"use client";

/**
 * Auth-aware CTA blocks used on the landing page.
 *
 * Renders one variant if the visitor is logged out (sign-up CTAs), and
 * a different variant if they're logged in (dashboard CTAs).
 *
 * Three exports, one per location on the page:
 *   - HeaderAuthCTA — top-nav right-side
 *   - HeroAuthCTA   — under the hero subhead
 *   - FinalAuthCTA  — bottom CTA section
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Play } from "lucide-react";

// ── Landing logo wrapper ───────────────────────────────────────────────────
//
// On the landing page the logo doubles as a "go home" link.
//   - logged out → "/"  (scroll back to top of the marketing page)
//   - logged in  → "/dashboard"  (jump back into the app)

export function LandingLogoLink({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const href = isAuthenticated ? "/dashboard" : "/";
  return (
    <Link
      href={href}
      className="flex items-center gap-2 hover:opacity-90 transition-opacity"
    >
      {children}
    </Link>
  );
}

// ── Top-nav (right side) ────────────────────────────────────────────────────

export function HeaderAuthCTA() {
  const { user, isAuthenticated } = useAuth();

  if (isAuthenticated && user) {
    const initial = (user.name || user.email || "U")[0]!.toUpperCase();
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="text-sm text-text-secondary hover:text-text-primary transition-colors px-2 py-2"
        >
          Dashboard
        </Link>
        <Link
          href="/dashboard/profile"
          className="w-8 h-8 rounded-full bg-accent-soft text-accent flex items-center justify-center text-sm font-bold hover:bg-accent hover:text-white transition-colors"
          title={user.name || user.email}
        >
          {initial}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/auth/login"
        className="text-sm text-text-secondary hover:text-text-primary transition-colors px-4 py-2"
      >
        Log in
      </Link>
      <Link href="/auth/signup">
        <Button size="sm">Start free</Button>
      </Link>
    </div>
  );
}

// ── Hero CTA (under headline) ───────────────────────────────────────────────

export function HeroAuthCTA() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return (
      <div
        className="flex flex-col items-center gap-3 animate-slide-up"
        style={{ animationDelay: "0.2s" }}
      >
        <Link href="/dashboard">
          <Button size="lg">
            Open your dashboard
            <ArrowRight className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <Check size={13} strokeWidth={3} className="text-accent" />
          Welcome back — your inbox is waiting
          <span className="text-text-tertiary/60">·</span>
          <a
            href="#demo-video"
            className="hover:text-text-primary transition-colors inline-flex items-center gap-1 underline-offset-4 hover:underline"
          >
            <Play size={11} />
            Watch demo
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-3 animate-slide-up"
      style={{ animationDelay: "0.2s" }}
    >
      <Link href="/auth/signup">
        <Button size="lg">
          Start finding buyers — free
          <ArrowRight className="w-5 h-5" />
        </Button>
      </Link>
      <div className="flex items-center gap-2 text-xs text-text-tertiary">
        <Check size={13} strokeWidth={3} className="text-accent" />
        No credit card required
        <span className="text-text-tertiary/60">·</span>
        <Check size={13} strokeWidth={3} className="text-accent" />
        30-day free trial
        <span className="text-text-tertiary/60">·</span>
        <a
          href="#demo-video"
          className="hover:text-text-primary transition-colors inline-flex items-center gap-1 underline-offset-4 hover:underline"
        >
          <Play size={11} />
          Watch demo
        </a>
      </div>
    </div>
  );
}

// ── Final CTA section (bottom of page) ──────────────────────────────────────

export function FinalAuthCTA() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return (
      <>
        <h2 className="text-3xl font-bold mb-4">Ready to dive back in?</h2>
        <p className="text-text-secondary mb-8">
          Your inbox is updated daily. Check what came in since your last visit.
        </p>
        <Link href="/dashboard">
          <Button size="lg">Open dashboard &rarr;</Button>
        </Link>
      </>
    );
  }

  return (
    <>
      <h2 className="text-3xl font-bold mb-4">Ready to find your next customers?</h2>
      <p className="text-text-secondary mb-8">
        Stop losing customers to competitors who reply first. Start capturing high-intent leads today.
      </p>
      <Link href="/auth/signup">
        <Button size="lg">Start free trial &rarr;</Button>
      </Link>
    </>
  );
}
