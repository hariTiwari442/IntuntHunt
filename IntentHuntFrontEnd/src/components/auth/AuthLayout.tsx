"use client";

import Link from "next/link";
import { ArrowLeft, Zap } from "lucide-react";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-bg-secondary to-bg-primary p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[150px]" />
        </div>

        <Link
          href="/"
          className="relative z-10 flex items-center gap-2 text-white/60 hover:text-white transition-colors w-fit"
        >
          <ArrowLeft size={20} />
          Back to home
        </Link>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-[#4df7c3] flex items-center justify-center">
              <Zap className="w-6 h-6 text-black" />
            </div>
            <span className="text-2xl font-bold">LeadPulse</span>
          </div>
          <h2 className="text-3xl font-bold mb-4">
            Find customers who are already looking for you
          </h2>
          <p className="text-white/50">
            Join 2,000+ founders discovering high-intent leads on Reddit and Hacker News.
          </p>
        </div>

        <div className="relative z-10 text-sm text-white/30">
          &copy; 2026 LeadPulse
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="lg:hidden flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-8"
          >
            <ArrowLeft size={20} />
            Back
          </Link>

          <h1 className="text-2xl font-bold mb-2">{title}</h1>
          <p className="text-white/50 mb-8">{subtitle}</p>

          {children}
        </div>
      </div>
    </div>
  );
}
