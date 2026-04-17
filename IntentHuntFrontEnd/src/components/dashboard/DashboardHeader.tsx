"use client";

import { useAuth } from "@/hooks/useAuth";
import { Bell } from "lucide-react";

interface DashboardHeaderProps {
  title: string;
  subtitle?: string;
}

export function DashboardHeader({ title, subtitle }: DashboardHeaderProps) {
  const { user } = useAuth();

  return (
    <header className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-white/50 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        <button className="relative p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-colors">
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent" />
        </button>
        <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold">
          {(user?.name || user?.email || "U")[0].toUpperCase()}
        </div>
      </div>
    </header>
  );
}
