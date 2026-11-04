import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  Briefcase,
  Headphones,
  Shield,
  ArrowRight
} from 'lucide-react';
import { useAuthStore } from '../stores/auth.store.js';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { api } from '../lib/api.js';
import { cn } from '../lib/utils.js';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'manager' | 'agent'>('manager');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login } = useAuthStore();
  const navigate = useNavigate();

  // Responsive password validation criteria matching backend Zod schema
  const passwordChecks = useMemo(() => {
    return [
      {
        id: 'length',
        label: 'At least 10 characters',
        met: password.length >= 10,
      },
      {
        id: 'uppercase',
        label: 'Uppercase letter (A-Z)',
        met: /[A-Z]/.test(password),
      },
      {
        id: 'number',
        label: 'Numeric digit (0-9)',
        met: /[0-9]/.test(password),
      },
      {
        id: 'special',
        label: 'Special symbol (!@#$%^&*)',
        met: /[^A-Za-z0-9]/.test(password),
      },
    ];
  }, [password]);

  const metCount = passwordChecks.filter((c) => c.met).length;

  const strengthInfo = useMemo(() => {
    if (!password) {
      return { score: 0, label: 'Password required', color: 'bg-slate-200', text: 'text-slate-400' };
    }
    if (metCount <= 1) {
      return { score: 1, label: 'Weak', color: 'bg-rose-500', text: 'text-rose-600' };
    }
    if (metCount === 2) {
      return { score: 2, label: 'Fair', color: 'bg-amber-500', text: 'text-amber-600' };
    }
    if (metCount === 3) {
      return { score: 3, label: 'Good', color: 'bg-sky-500', text: 'text-sky-600' };
    }
    return { score: 4, label: 'Strong', color: 'bg-emerald-600', text: 'text-emerald-600' };
  }, [password, metCount]);

  const roleOptions: Array<{
    id: 'manager' | 'agent' | 'admin';
    title: string;
    badge: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'manager',
      title: 'Manager',
      badge: 'Operations',
      desc: 'Campaigns, contact ingest & workflows',
      icon: Briefcase,
    },
    {
      id: 'agent',
      title: 'Agent',
      badge: 'Inbox',
      desc: 'Real-time chats & manual takeovers',
      icon: Headphones,
    },
    {
      id: 'admin',
      title: 'Admin',
      badge: 'Full',
      desc: 'Settings, integrations & workspace controls',
      icon: Shield,
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side pre-validation for registration to avoid unexpected 400s
    if (isRegisterMode) {
      if (name.trim().length < 2) {
        setError('Please enter your full name (at least 2 characters).');
        return;
      }
      if (metCount < 4) {
        setError('Please satisfy all 4 password security criteria before creating your account.');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (isRegisterMode) {
        await api.post('/auth/register', { name: name.trim(), email: email.trim(), password, role });
      }
      await login(email.trim(), password);
      navigate('/inbox');
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDemoLogin = async (demoRole: 'manager' | 'agent' | 'admin') => {
    setIsLoading(true);
    setError(null);

    const demoEmail = `${demoRole}@company.com`;
    const demoPassword = 'StrongPassword123!';

    try {
      await login(demoEmail, demoPassword);
      navigate('/inbox');
    } catch {
      try {
        await api.post('/auth/register', {
          name: demoRole === 'manager' ? 'Alice Manager' : demoRole === 'agent' ? 'Sarah Agent' : 'Admin User',
          email: demoEmail,
          password: demoPassword,
          role: demoRole,
        });
        await login(demoEmail, demoPassword);
        navigate('/inbox');
      } catch (regErr: any) {
        setError(regErr.message || 'Quick login failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 relative py-12 px-4 sm:px-6 lg:px-8 overflow-y-auto">
      {/* Background Decorative Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage: `radial-gradient(#0f172a 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      <div className="w-full max-w-lg space-y-6 relative z-10 my-auto">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-700 via-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-600/20 font-bold text-2xl mb-1 border border-emerald-400/30">
            F
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            FlowDesk Platform
          </h1>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            WhatsApp automation, multi-agent shared inbox, and live spreadsheet verification
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xl shadow-slate-200/50 p-6 sm:p-8 transition-all">
          {/* Segmented Mode Selector */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl mb-6 border border-slate-200/80">
            <button
              type="button"
              onClick={() => {
                setIsRegisterMode(false);
                setError(null);
              }}
              className={cn(
                'py-2 text-xs font-semibold rounded-lg transition-all',
                !isRegisterMode
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              )}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRegisterMode(true);
                setError(null);
              }}
              className={cn(
                'py-2 text-xs font-semibold rounded-lg transition-all',
                isRegisterMode
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              )}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegisterMode && (
              <>
                <Input
                  label="Full Name"
                  id="name"
                  placeholder="e.g. Alice Manager"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />

                {/* Role Selector Cards */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">Account Role</label>
                    <span className="text-[11px] text-slate-400">Determines workspace permissions</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {roleOptions.map((opt) => {
                      const Icon = opt.icon;
                      const isSelected = role === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setRole(opt.id)}
                          className={cn(
                            'flex flex-col p-2.5 rounded-xl border text-left transition-all',
                            isSelected
                              ? 'border-emerald-600 bg-emerald-50/60 shadow-sm ring-1 ring-emerald-600'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                          )}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <Icon className={cn('w-4 h-4', isSelected ? 'text-emerald-700' : 'text-slate-400')} />
                            <span
                              className={cn(
                                'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                                isSelected
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 text-slate-500'
                              )}
                            >
                              {opt.badge}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-900">{opt.title}</p>
                          <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5 leading-snug">
                            {opt.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <Input
              label="Work Email"
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-semibold text-slate-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="flex h-9 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-10 py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                  tabIndex={-1}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Responsive Password Strength & Requirement Checklist (in Register Mode) */}
              {isRegisterMode && (
                <div className="pt-2 pb-1 space-y-2.5 bg-slate-50/80 p-3 rounded-xl border border-slate-200/70">
                  {/* Strength Bar Meter */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">Password strength</span>
                      <span className={cn('font-semibold text-xs transition-colors', strengthInfo.text)}>
                        {strengthInfo.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 h-1.5">
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={cn(
                            'h-full rounded-full transition-all duration-300',
                            strengthInfo.score >= step ? strengthInfo.color : 'bg-slate-200'
                          )}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Criteria Checklist with Responsive Ticks */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                    {passwordChecks.map((check) => (
                      <div
                        key={check.id}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1 rounded-lg text-[11px] transition-all',
                          check.met
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-medium'
                            : 'bg-white text-slate-400 border border-slate-200/60'
                        )}
                      >
                        <div
                          className={cn(
                            'w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] transition-colors',
                            check.met
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 text-slate-300 border border-slate-300'
                          )}
                        >
                          {check.met ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : <span className="w-1 h-1 rounded-full bg-slate-400" />}
                        </div>
                        <span className="truncate">{check.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200/80 text-xs text-rose-700 font-medium flex items-start gap-2.5 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full h-10 font-semibold shadow-md shadow-emerald-600/10"
              isLoading={isLoading}
            >
              <span>{isRegisterMode ? 'Create FlowDesk Account' : 'Sign In to Workspace'}</span>
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{isRegisterMode ? 'Already registered on FlowDesk?' : "Need a workspace account?"}</span>
            <button
              type="button"
              onClick={() => {
                setIsRegisterMode(!isRegisterMode);
                setError(null);
              }}
              className="text-emerald-700 font-semibold hover:text-emerald-800 transition-colors"
            >
              {isRegisterMode ? 'Sign In Instead' : 'Register Here'}
            </button>
          </div>
        </div>

        {/* Instant Demo Role Shortcuts */}
        <div className="bg-white/80 backdrop-blur rounded-2xl border border-slate-200/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              One-Click Test Shortcuts
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Demo: StrongPassword123!
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleQuickDemoLogin('manager')}
              disabled={isLoading}
              className="flex-col h-auto py-2 px-1 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold gap-0.5"
            >
              <span>Manager</span>
              <span className="text-[9px] font-normal text-slate-400">Campaigns</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleQuickDemoLogin('agent')}
              disabled={isLoading}
              className="flex-col h-auto py-2 px-1 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold gap-0.5"
            >
              <span>Agent</span>
              <span className="text-[9px] font-normal text-slate-400">Inbox Chat</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleQuickDemoLogin('admin')}
              disabled={isLoading}
              className="flex-col h-auto py-2 px-1 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold gap-0.5"
            >
              <span>Admin</span>
              <span className="text-[9px] font-normal text-slate-400">Full Access</span>
            </Button>
          </div>
        </div>

        {/* Security Footer Notice */}
        <div className="flex items-center justify-center gap-1.5 text-slate-400 text-[11px]">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>RBAC protected workspace • WhatsApp Business API ready</span>
        </div>
      </div>
    </div>
  );
};
