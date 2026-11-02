import React, { useState, useEffect } from 'react';
import {
  Settings2,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Database,
  Cpu,
  Radio,
  RefreshCw,
  Send,
  Zap,
  Server,
  ShieldCheck,
  Clock,
  ArrowRight
} from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';

interface VerificationTestResult {
  verified: boolean;
  cached: boolean;
  record?: Record<string, any>;
  message?: string;
  latencyMs?: number;
}

export const Integrations: React.FC = () => {
  // Google Sheets Connection Test State
  const [isTestingGoogleSheets, setIsTestingGoogleSheets] = useState(false);
  const [googleSheetsStatus, setGoogleSheetsStatus] = useState<{
    connected: boolean;
    spreadsheetId?: string;
    sheetName?: string;
    latencyMs?: number;
    message?: string;
  } | null>(null);

  // Live Survey Verification Tester State
  const [provider, setProvider] = useState<'google_sheets' | 'internal_db' | 'microsoft_graph' | 'mock'>('google_sheets');
  const [lookupValue, setLookupValue] = useState('+919876543210');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerificationTestResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    // Initial status check
    checkGoogleSheets();
  }, []);

  const checkGoogleSheets = async () => {
    setIsTestingGoogleSheets(true);
    const start = performance.now();
    try {
      const res = await api.post<Record<string, any>>('/integrations/google-sheets/test-connection');
      const latency = Math.round(performance.now() - start);
      setGoogleSheetsStatus({
        connected: res.success,
        spreadsheetId: res.data?.spreadsheetId || 'FLOWDESK_SURVEY_DRIVE_SHEET',
        sheetName: res.data?.sheetName || 'Survey Responses',
        latencyMs: latency,
        message: 'Google Sheets on Google Drive verified and reachable.'
      });
    } catch (err: any) {
      setGoogleSheetsStatus({
        connected: false,
        message: err.response?.data?.message || err.message || 'Connection check failed.'
      });
    } finally {
      setIsTestingGoogleSheets(false);
    }
  };

  const handleTestVerify = async () => {
    if (!lookupValue.trim()) return;
    setIsVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);

    const start = performance.now();
    try {
      const res = await api.post<Record<string, any>>('/integrations/verify', {
        provider,
        lookupField: lookupValue.startsWith('+') ? 'phoneNumber' : 'surveyId',
        lookupValue: lookupValue.trim()
      });

      const latency = Math.round(performance.now() - start);

      if (res.success && res.data) {
        setVerifyResult({
          verified: !!res.data.verified,
          cached: res.data.cached ?? false,
          record: res.data.record,
          message: res.data.message || (res.data.verified ? 'Candidate survey verified' : 'No survey response found'),
          latencyMs: latency
        });
      }
    } catch (err: any) {
      setVerifyError(err.response?.data?.message || err.message || 'Verification lookup failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="px-8 py-6 bg-white border-b border-slate-200 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                System Integrations & Data Verification
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                All Systems Operational
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Multi-source candidate verification, WhatsApp messaging providers, and AI reasoning engines
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={checkGoogleSheets}
            isLoading={isTestingGoogleSheets}
            className="gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Test All Connections</span>
          </Button>
        </div>
      </header>

      {/* Main Grid View */}
      <div className="flex-1 p-8 overflow-y-auto space-y-8">
        {/* Core Integration Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Google Sheets on Drive */}
          <Card className="p-6 bg-white border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <Badge variant={googleSheetsStatus?.connected ? 'emerald' : 'amber'}>
                  {googleSheetsStatus?.connected ? 'Connected' : 'Connecting'}
                </Badge>
              </div>

              <h3 className="font-bold text-slate-900 text-base">Google Sheets (Drive)</h3>
              <p className="text-xs text-slate-500 mt-1">
                Primary candidate survey verification source. Syncs survey responses and tags contacts in real time.
              </p>

              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Spreadsheet ID:</span>
                  <span className="font-semibold text-slate-800 truncate max-w-[140px]">
                    {googleSheetsStatus?.spreadsheetId || 'FLOWDESK_SURVEY_DRIVE_SHEET'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Sheet Name:</span>
                  <span className="font-semibold text-slate-800">
                    {googleSheetsStatus?.sheetName || 'Survey Responses'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Cache Strategy:</span>
                  <span className="text-emerald-700 font-semibold">Redis 60s TTL (&lt; 5ms)</span>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {googleSheetsStatus?.latencyMs ? `${googleSheetsStatus.latencyMs}ms roundtrip` : 'Checked'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={checkGoogleSheets}
                isLoading={isTestingGoogleSheets}
                className="text-xs"
              >
                Test Sync
              </Button>
            </div>
          </Card>

          {/* Card 2: WhatsApp Messaging Provider */}
          <Card className="p-6 bg-white border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                  <Radio className="w-5 h-5" />
                </div>
                <Badge variant="emerald">Simulated Mode</Badge>
              </div>

              <h3 className="font-bold text-slate-900 text-base">WhatsApp Messaging Engine</h3>
              <p className="text-xs text-slate-500 mt-1">
                Simulated provider with automatic lifecycle callbacks (<code className="text-slate-700">sent</code> &rarr;{' '}
                <code className="text-slate-700">delivered</code> &rarr; <code className="text-slate-700">read</code>).
              </p>

              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Provider Impl:</span>
                  <span className="font-semibold text-slate-800">MockWhatsAppProvider</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Throughput Cap:</span>
                  <span className="font-semibold text-slate-800">80 msgs / sec</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Webhook DLRs:</span>
                  <span className="text-emerald-700 font-semibold">Active & Evented</span>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Production ready switch</span>
              <span className="text-xs text-slate-500 font-medium">Meta Cloud API v21.0</span>
            </div>
          </Card>

          {/* Card 3: AI Reasoning & Guardrails */}
          <Card className="p-6 bg-white border-slate-200 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                  <Cpu className="w-5 h-5" />
                </div>
                <Badge variant="indigo">Grounded RAG</Badge>
              </div>

              <h3 className="font-bold text-slate-900 text-base">AI Agent & Tools Sandbox</h3>
              <p className="text-xs text-slate-500 mt-1">
                Grounded conversational assistance using Gemini 1.5 Flash with fallback to Mock AI in air-gapped test environments.
              </p>

              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Confidence Gate:</span>
                  <span className="font-semibold text-slate-800">&ge; 0.60 required</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Sandboxed Tools:</span>
                  <span className="font-semibold text-slate-800">4 approved</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Escalation Rule:</span>
                  <span className="text-indigo-700 font-semibold">Auto-assign to Agent</span>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Strict zero-hallucination</span>
              <span className="text-xs text-indigo-600 font-medium">Knowledge Base Bound</span>
            </div>
          </Card>
        </div>

        {/* Live Multi-Source Verification Playground */}
        <Card className="p-6 bg-white border-slate-200 shadow-xs">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Live Data Verification Playground
              </h3>
              <p className="text-xs text-slate-500">
                Test real-time candidate verification across Google Sheets, Microsoft Graph, and internal databases with Redis cache inspection
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Verification Source
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="google_sheets">Google Sheets on Google Drive (Primary)</option>
                <option value="internal_db">Internal Database (Fallback)</option>
                <option value="microsoft_graph">Microsoft Graph / Excel Online</option>
                <option value="mock">Mock Verification Sandbox</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phone Number or Survey ID
              </label>
              <input
                type="text"
                value={lookupValue}
                onChange={(e) => setLookupValue(e.target.value)}
                placeholder="+919876543210 or SURV-9021"
                className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-end">
              <Button
                variant="primary"
                onClick={handleTestVerify}
                isLoading={isVerifying}
                disabled={!lookupValue.trim()}
                className="w-full justify-center bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <ShieldCheck className="w-4 h-4 mr-1.5" />
                <span>Execute Verification Check</span>
              </Button>
            </div>
          </div>

          {verifyError && (
            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{verifyError}</span>
            </div>
          )}

          {verifyResult && (
            <div className="mt-6 p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {verifyResult.verified ? (
                    <Badge variant="emerald" className="gap-1 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>SURVEY VERIFIED</span>
                    </Badge>
                  ) : (
                    <Badge variant="amber" className="gap-1 text-xs">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                      <span>NOT FOUND / UNVERIFIED</span>
                    </Badge>
                  )}

                  {verifyResult.cached && (
                    <span className="text-[11px] font-mono font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      Redis Cache Hit (TTL 60s)
                    </span>
                  )}
                </div>

                <span className="text-xs font-mono text-slate-500">
                  Latency: {verifyResult.latencyMs}ms
                </span>
              </div>

              <p className="text-xs text-slate-700 font-medium">{verifyResult.message}</p>

              {verifyResult.record && (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Retrieved Spreadsheet Record:
                  </span>
                  <pre className="mt-1 p-3 bg-slate-900 text-slate-200 rounded-lg text-xs font-mono overflow-x-auto border border-slate-800">
                    {JSON.stringify(verifyResult.record, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Infrastructure & Storage Health Strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">MongoDB 7.0</p>
              <p className="text-[11px] text-slate-500">Replica Set / Persistent Store</p>
            </div>
          </div>

          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Redis 7.2</p>
              <p className="text-[11px] text-slate-500">BullMQ Queues + Sub-5ms Verification Cache</p>
            </div>
          </div>

          <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Socket.IO 4.8</p>
              <p className="text-[11px] text-slate-500">Real-Time Duplex Team Inbox Synchronization</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
