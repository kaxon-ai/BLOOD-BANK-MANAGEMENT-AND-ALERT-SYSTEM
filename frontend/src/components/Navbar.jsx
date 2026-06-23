"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Droplets, LayoutDashboard, Package, Users, Bell, LogOut, Activity } from "lucide-react";
import { useAuth } from "../app/layout";
import { clsx } from "clsx";

const NAV = [
  { href: "/",          label: "Dashboard",  icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory",  icon: Package },
  { href: "/donors",    label: "Donors",     icon: Users },
  { href: "/alerts",    label: "Alerts",     icon: Bell },
];

export default function Navbar() {
  const path = usePathname();
  const { user, logout } = useAuth() || {};

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-ink/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center gap-6 h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 mr-2 shrink-0">
          <div className="relative">
            <Droplets className="w-6 h-6 text-crimson" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-crimson animate-pulse" />
          </div>
          <span className="font-bold text-sm tracking-tight">
            Smart<span className="text-crimson">Blood</span>Bank
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1 flex-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                path === href
                  ? "bg-crimson/15 text-crimson"
                  : "text-muted hover:text-text hover:bg-raised"
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1.5 text-xs text-muted">
            <Activity className="w-3.5 h-3.5 text-safe" />
            <span className="text-safe font-medium">System Online</span>
          </div>
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted hidden md:block">
                {user.name || user.email}
              </span>
              <button onClick={logout} className="btn-ghost text-muted">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link href="/login" className="btn-primary py-1.5 text-xs">Sign In</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
