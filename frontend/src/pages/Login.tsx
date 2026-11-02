import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store.js';
import { Button } from '../components/ui/Button.js';
import { Input } from '../components/ui/Input.js';
import { Card } from '../components/ui/Card.js';
import { api } from '../lib/api.js';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'manager' | 'agent'>('manager');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (isRegisterMode) {
        await api.post('/auth/register', { name, email, password, role });
      }
      await login(email, password);
      navigate('/inbox');
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
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
      // Attempt login
      await login(demoEmail, demoPassword);
      navigate('/inbox');
    } catch {
      // If demo user does not exist yet, auto-register then login
      try {
        await api.post('/auth/register', {
          name: demoRole === 'manager' ? 'Alice Manager' : demoRole === 'agent' ? 'Sarah Agent' : 'Admin User',
          email: demoEmail,
          password: demoPassword,
          role: demoRole
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
    <div className="min-h-screen w-screen flex items-center justify-center bg-slate-100/80 px-4 py-8 select-none">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-600 text-white shadow-md font-bold text-2xl mb-2">
            F
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            FlowDesk Platform
          </h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Internal WhatsApp automation, recruitment campaigns, and team inbox
          </p>
        </div>

        {/* Auth Card */}
        <Card className="p-6 shadow-md border-slate-200">
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegisterMode && (
              <>
                <Input
                  label="Full Name"
                  id="name"
                  placeholder="e.g. Aman Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">Role</label>
                  <select
                    className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                  >
                    <option value="manager">Manager (Campaigns & Ingest)</option>
                    <option value="agent">Agent (Team Inbox Chat)</option>
                    <option value="admin">Admin (Full Access)</option>
                  </select>
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

            <Input
              label="Password"
              id="password"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium leading-relaxed">
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" className="w-full" isLoading={isLoading}>
              {isRegisterMode ? 'Create Account' : 'Sign In to Workspace'}
            </Button>
          </form>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{isRegisterMode ? 'Already have an account?' : "Don't have an account?"}</span>
            <button
              type="button"
              onClick={() => {
                setIsRegisterMode(!isRegisterMode);
                setError(null);
              }}
              className="text-emerald-700 font-semibold hover:underline"
            >
              {isRegisterMode ? 'Sign In' : 'Register New'}
            </button>
          </div>
        </Card>

        {/* Instant Demo Role Shortcuts */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
            One-Click Test Shortcuts
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleQuickDemoLogin('manager')}
              disabled={isLoading}
              className="justify-center border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs"
            >
              Manager Login
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleQuickDemoLogin('agent')}
              disabled={isLoading}
              className="justify-center border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs"
            >
              Agent Login
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
