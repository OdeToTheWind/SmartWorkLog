import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth, ROLE_COLOR, ROLE_LABEL } from "../lib/auth";
import {
  HouseIcon as House, ListChecksIcon as ListChecks, UsersIcon as Users, BellIcon as Bell, CalendarIcon as Calendar, ChartLineUpIcon as ChartLineUp,
  ClipboardTextIcon as ClipboardText, SignOutIcon as SignOut, ListIcon as List, XIcon as X, TrophyIcon as Trophy, ShieldCheckIcon as ShieldCheck, KanbanIcon as Kanban
} from "@phosphor-icons/react";

const NAV_BY_ROLE = {
  employee: [
    { to: "/", label: "Dashboard", icon: House },
    { to: "/tasks", label: "My Tasks", icon: ListChecks },
    { to: "/daily-update", label: "Daily Update", icon: ClipboardText },
    { to: "/notifications", label: "Notifications", icon: Bell },
    { to: "/leave", label: "Leave", icon: Calendar },
  ],
  team_member: [
    { to: "/", label: "Team Board", icon: House },
    { to: "/tasks", label: "Shared Tasks", icon: ListChecks },
    { to: "/daily-update", label: "Daily Update", icon: ClipboardText },
    { to: "/notifications", label: "Notifications", icon: Bell },
    { to: "/leave", label: "Leave", icon: Calendar },
  ],
  developer: [
    { to: "/", label: "Kanban", icon: Kanban },
    { to: "/tasks", label: "All Tasks", icon: ListChecks },
    { to: "/daily-update", label: "Daily Update", icon: ClipboardText },
    { to: "/notifications", label: "Notifications", icon: Bell },
    { to: "/audit", label: "Audit", icon: ShieldCheck },
  ],
  supervisor: [
    { to: "/", label: "Team Overview", icon: House },
    { to: "/tasks", label: "Tasks", icon: ListChecks },
    { to: "/people", label: "Team", icon: Users },
    { to: "/leave", label: "Leave", icon: Calendar },
    { to: "/audit", label: "Audit Log", icon: ShieldCheck },
    { to: "/notifications", label: "Notifications", icon: Bell },
  ],
  hr: [
    { to: "/", label: "Company Health", icon: ChartLineUp },
    { to: "/tasks", label: "All Tasks", icon: ListChecks },
    { to: "/people", label: "People", icon: Users },
    { to: "/leave", label: "Leave", icon: Calendar },
    { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { to: "/audit", label: "Audit Log", icon: ShieldCheck },
    { to: "/notifications", label: "Notifications", icon: Bell },
  ],
  super_admin: [
    { to: "/", label: "Overview", icon: ChartLineUp },
    { to: "/people", label: "People", icon: Users },
    { to: "/tasks", label: "Tasks", icon: ListChecks },
    { to: "/audit", label: "Audit Log", icon: ShieldCheck },
  ],
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const [mobOpen, setMobOpen] = useState(false);
  if (!user) return null;
  const items = NAV_BY_ROLE[user.role] || [];
  const roleColor = ROLE_COLOR[user.role] || "#0F172A";

  const Sidebar = (
    <aside className="w-64 fixed left-0 top-0 h-screen border-r border-slate-200 bg-white z-40 flex flex-col">
      <div className="px-5 py-5 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-white" style={{ background: "#0F172A" }}>W</div>
          <div>
            <div className="font-semibold text-sm tracking-tight">Smart WorkLog</div>
            <div className="label-eyebrow">AI</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.map((it) => {
          const Active = loc.pathname === it.to;
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              data-testid={`nav-${it.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={`sidebar-link ${Active ? "active" : ""}`}
              onClick={() => setMobOpen(false)}
            >
              <Icon size={18} weight={Active ? "fill" : "regular"} />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-9 h-9 rounded-md flex items-center justify-center text-white font-semibold text-sm" style={{ background: roleColor }}>
            {user.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user.name}</div>
            <div className="text-xs text-slate-500 truncate">{ROLE_LABEL[user.role]}</div>
          </div>
          <button data-testid="logout-btn" onClick={logout} className="p-2 hover:bg-slate-100 rounded-md text-slate-500">
            <SignOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="App min-h-screen bg-slate-50">
      <div className="hidden lg:block">{Sidebar}</div>

      {/* Mobile header */}
      <header className="lg:hidden sticky top-0 bg-white border-b border-slate-200 z-30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button data-testid="mobile-menu-toggle" onClick={() => setMobOpen(true)} className="p-1.5 -ml-1">
            <List size={22} />
          </button>
          <div className="font-semibold tracking-tight">Smart WorkLog</div>
        </div>
        <span className="role-pill" style={{ background: `${roleColor}15`, color: roleColor, border: `1px solid ${roleColor}30` }}>
          {ROLE_LABEL[user.role]}
        </span>
      </header>

      {mobOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setMobOpen(false)}>
          <div className="absolute left-0 top-0 h-full" onClick={(e) => e.stopPropagation()}>
            <div className="relative">
              {Sidebar}
              <button onClick={() => setMobOpen(false)} className="absolute right-2 top-2 p-2 z-50 bg-white rounded-md border">
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="lg:ml-64 p-4 sm:p-8 min-h-screen">
        {children}
      </main>
    </div>
  );
}
