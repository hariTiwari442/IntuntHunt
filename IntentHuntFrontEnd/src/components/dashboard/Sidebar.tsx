"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { usePlan } from "@/hooks/usePlan";
import {
  Zap,
  LayoutDashboard,
  Package,
  Plus,
  User,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  Crown,
} from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/products", label: "Products", icon: Package },
  { href: "/dashboard/products/new", label: "Add Product", icon: Plus },
  { href: "/dashboard/profile", label: "Profile", icon: User },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { plan, features } = usePlan();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-bg-secondary border-r border-border-default flex flex-col transition-all duration-300 z-30",
        collapsed ? "w-[72px]" : "w-[240px]"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border-default">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-[#22d3ee] flex items-center justify-center shrink-0">
          <Zap className="w-5 h-5 text-white" />
        </div>
        {!collapsed && <span className="text-lg font-bold">LeadPulse</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-accent-soft text-accent"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-card-hover"
              )}
            >
              <item.icon size={20} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Plan badge */}
      {!collapsed && (
        <div className="mx-3 mb-3 p-3 rounded-xl border border-border-default bg-bg-muted">
          <div className="flex items-center gap-2 mb-2">
            <Crown size={14} className="text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              {features.label} Plan
            </span>
          </div>
          {features.jobsPerMonth !== null && (
            <p className="text-xs text-text-tertiary">{features.jobsPerMonth} products/month</p>
          )}
          <Link
            href="/pricing"
            className="text-xs text-accent hover:text-accent-hover transition-colors mt-1 inline-block"
          >
            Upgrade
          </Link>
        </div>
      )}

      {/* User + collapse */}
      <div className="border-t border-border-default p-3 space-y-2">
        {!collapsed && user && (
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="w-8 h-8 rounded-full bg-accent-soft text-accent flex items-center justify-center text-sm font-bold">
              {(user.name || user.email)[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user.name || "User"}</p>
              <p className="text-xs text-text-tertiary truncate">{user.email}</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={onToggle}
            className="flex items-center justify-center w-full p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-card-hover transition-colors"
          >
            {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>
          <button
            onClick={logout}
            className="flex items-center justify-center p-2 rounded-lg text-text-tertiary hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}
