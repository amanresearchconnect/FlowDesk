import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Inbox,
  Send,
  Users,
  GitBranch,
  BookOpen,
  Settings2,
  LogOut,
  Radio,
  FileSpreadsheet,
  Menu,
  X
} from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store.js';
import { getSocket } from '../../lib/socket.js';
import { cn } from '../../lib/utils.js';

interface NavItem {
  name: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [socketConnected, setSocketConnected] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      setSocketConnected(socket.connected);
      const onConnect = () => setSocketConnected(true);
      const onDisconnect = () => setSocketConnected(false);

      socket.on('connect', onConnect);
      socket.on('disconnect', onDisconnect);

      return () => {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
      };
    }
  }, []);

  const navItems: NavItem[] = [
    { name: 'Team Inbox', to: '/inbox', icon: Inbox },
    { name: 'Campaigns', to: '/campaigns', icon: Send },
    { name: 'Contacts & Ingest', to: '/contacts', icon: Users },
    { name: 'Workflows', to: '/workflows', icon: GitBranch },
    { name: 'Knowledge Base', to: '/knowledge-base', icon: BookOpen },
    { name: 'Integrations', to: '/integrations', icon: Settings2 },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getRoleBadgeClasses = (role?: string) => {
    switch (role) {
      case 'admin':
        return 'bg-indigo-950/80 text-indigo-300 border border-indigo-700/50';
      case 'manager':
        return 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50';
      case 'agent':
      default:
        return 'bg-sky-950/80 text-sky-300 border border-sky-700/50';
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-300 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-5 h-16 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-sm font-bold text-base">
            F
          </div>
          <div>
            <span className="text-white font-semibold tracking-tight text-base">FlowDesk</span>
            <span className="block text-[10px] uppercase font-bold tracking-wider text-emerald-400">
              Automation Hub
            </span>
          </div>
        </div>

        {/* Close Button on Mobile Drawer */}
        <button
          onClick={() => setIsMobileNavOpen(false)}
          className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setIsMobileNavOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-slate-800 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
                )
              }
            >
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0 text-slate-400" />
                <span>{item.name}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-600 text-white">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* System & Verification Quick Status */}
      <div className="px-4 py-3 mx-3 mb-3 bg-slate-800/60 rounded-xl border border-slate-800 text-xs space-y-2">
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Google Sheets</span>
          </span>
          <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/50">
            Active
          </span>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-sky-400" />
            <span>Socket Engine</span>
          </span>
          <span
            className={cn(
              'inline-block w-2 h-2 rounded-full',
              socketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
            )}
          />
        </div>
      </div>

      {/* User Profile Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-white shrink-0">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name || 'Operator'}</p>
              <span
                className={cn(
                  'inline-block px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-wider rounded',
                  getRoleBadgeClasses(user?.role)
                )}
              >
                {user?.role || 'agent'}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 font-sans">
      {/* 1. Desktop Deep Slate Navigation Sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileNavOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileNavOpen(false)}
          />
          <div className="relative flex flex-col w-72 max-w-[80vw] h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* 2. Main Page Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Mobile Header Bar */}
        <header className="md:hidden flex items-center justify-between px-4 h-14 bg-slate-900 text-white border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsMobileNavOpen(true)}
              className="p-1.5 -ml-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-6 h-6 rounded bg-emerald-600 flex items-center justify-center text-white font-bold text-xs">
              F
            </div>
            <span className="font-semibold text-sm tracking-tight">FlowDesk</span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-block w-2 h-2 rounded-full',
                socketConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              )}
              title={socketConnected ? 'Socket connected' : 'Socket disconnected'}
            />
            <span
              className={cn(
                'px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-wider rounded',
                getRoleBadgeClasses(user?.role)
              )}
            >
              {user?.role || 'agent'}
            </span>
          </div>
        </header>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
