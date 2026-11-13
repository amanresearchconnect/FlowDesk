import React, { useEffect, useState, useId } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  MessageSquare,
  Award,
  Headphones,
  Users,
  RefreshCw,
  Filter,
  Send,
  Search,
  CheckCheck,
  TrendingDown,
  Calendar,
  Sparkles
} from 'lucide-react';
import { api } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

interface OverviewMetrics {
  totalCampaigns: number;
  totalAudience: number;
  dispatched: number;
  delivered: number;
  read: number;
  replied: number;
  startedWorkflow: number;
  completedGoal: number;
  humanEscalated: number;
  deliveryRate: number;
  readRate: number;
  replyRate: number;
  goalCompletionRate: number;
  humanHandoffRate: number;
}

interface FunnelStage {
  stage: string;
  count: number;
  percentageOfTop: number;
  dropOffCount: number;
  dropOffRate: number;
  description: string;
}

interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  stats?: {
    totalContacts: number;
    dispatched: number;
    delivered: number;
    read: number;
    replied: number;
    startedWorkflow?: number;
    completedGoal?: number;
    humanEscalated?: number;
    failed?: number;
  };
  workflowId?: { id: string; name: string } | null;
  knowledgeBaseId?: { id: string; name: string } | null;
  createdAt: string;
}

interface CampaignRecipient {
  id: string;
  name: string;
  phone: string;
  email: string;
  delivered: boolean;
  read: boolean;
  replied: boolean;
  transferredToHuman: boolean;
  completedWorkflow: boolean;
  status: 'completed' | 'in_progress' | 'transferred' | 'opt_out' | 'delivered' | 'sent';
  lastActivityAt?: string;
}

export const Analytics: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const selectedCampaignId = searchParams.get('campaignId') || 'all';
  const selectedTimeRange = searchParams.get('timeRange') || 'all';

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const campaignSelectId = useId();
  const timeRangeSelectId = useId();

  // Load campaign list for filter selector
  useEffect(() => {
    async function fetchCampaigns() {
      try {
        const res = await api.get<any>('/campaigns?limit=100');
        if (res.data) {
          const list = Array.isArray(res.data) ? res.data : res.data.campaigns || [];
          setCampaigns(list);
        }
      } catch (err: any) {
        console.error('Failed to load campaigns for analytics selector', err);
      }
    }
    fetchCampaigns();
  }, []);

  // Fetch metrics, funnel, and recipient data
  const loadAnalyticsData = async () => {
    setIsLoading(true);
    try {
      const campParam = selectedCampaignId !== 'all' ? `&campaignId=${selectedCampaignId}` : '';
      const timeParam = selectedTimeRange !== 'all' ? `&timeRange=${selectedTimeRange}` : '';

      const [overviewRes, funnelRes, recipientsRes] = await Promise.all([
        api.get<OverviewMetrics>(`/analytics/overview?${campParam}${timeParam}`),
        api.get<{ stages: FunnelStage[] }>(`/analytics/funnel?${campParam}`),
        api.get<CampaignRecipient[]>(`/analytics/recipients?${campParam}`)
      ]);

      if (overviewRes.data) {
        setMetrics(overviewRes.data);
      }
      if (funnelRes.data?.stages) {
        setFunnelStages(funnelRes.data.stages);
      }
      if (recipientsRes.data) {
        setRecipients(Array.isArray(recipientsRes.data) ? recipientsRes.data : []);
      }
    } catch (err: any) {
      console.error('Failed to fetch analytics data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalyticsData();
  }, [selectedCampaignId, selectedTimeRange]);

  // Recalculate and cleanse stats from duplicate counts
  const handleRecalculate = async () => {
    setIsSyncing(true);
    try {
      const body = selectedCampaignId !== 'all' ? { campaignId: selectedCampaignId } : {};
      await api.post('/analytics/recalculate', body);
      await loadAnalyticsData();
    } catch (err: any) {
      console.error('Sync failed', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCampaignFilterChange = (id: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (id === 'all') {
      newParams.delete('campaignId');
    } else {
      newParams.set('campaignId', id);
    }
    setSearchParams(newParams);
  };

  const handleTimeRangeChange = (range: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (range === 'all') {
      newParams.delete('timeRange');
    } else {
      newParams.set('timeRange', range);
    }
    setSearchParams(newParams);
  };

  const currentCampaign = campaigns.find((c) => c.id === selectedCampaignId);
  const selectedCampaignName =
    selectedCampaignId === 'all'
      ? 'All Campaigns (Aggregated)'
      : currentCampaign?.name || 'Selected Campaign';

  // Filter recipients by search input
  const filteredRecipients = recipients.filter((r) => {
    if (!recipientSearch.trim()) return true;
    const query = recipientSearch.toLowerCase();
    return (
      r.name.toLowerCase().includes(query) ||
      r.phone.toLowerCase().includes(query) ||
      r.email.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 p-6 space-y-6">
      {/* Top Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="xs"
              onClick={() => navigate('/campaigns')}
              className="text-slate-600 hover:text-slate-900 border-slate-300 bg-white shadow-2xs font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" />
              Campaigns
            </Button>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Campaign Analytics</h1>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
              Unique Contacts Verified
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Clear, deduplicated delivery, engagement, and workflow completion metrics
          </p>
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Campaign Selector */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <label htmlFor={campaignSelectId} className="sr-only">Campaign</label>
            <select
              id={campaignSelectId}
              value={selectedCampaignId}
              onChange={(e) => handleCampaignFilterChange(e.target.value)}
              className="text-xs text-slate-800 font-semibold bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer pr-2 max-w-[220px] truncate"
            >
              <option value="all">📊 All Campaigns (Aggregated)</option>
              {campaigns.map((camp) => (
                <option key={camp.id} value={camp.id}>
                  {camp.name} ({camp.status})
                </option>
              ))}
            </select>
          </div>

          {/* Time Range Selector */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <label htmlFor={timeRangeSelectId} className="sr-only">Time Range</label>
            <select
              id={timeRangeSelectId}
              value={selectedTimeRange}
              onChange={(e) => handleTimeRangeChange(e.target.value)}
              className="text-xs text-slate-800 font-medium bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>

          {/* Sync & Recalculate Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecalculate}
            disabled={isSyncing}
            className="text-slate-700 border-slate-300 hover:bg-slate-100 shadow-2xs font-medium"
            title="Cleanse and synchronize recipient statistics"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-slate-500 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync & Cleanse'}
          </Button>
        </div>
      </div>

      {/* Active Selection Banner */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600/10 text-emerald-700 flex items-center justify-center font-bold">
            <Send className="w-4 h-4 text-emerald-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">{selectedCampaignName}</span>
              {currentCampaign && (
                <Badge
                  variant={
                    currentCampaign.status === 'active' || currentCampaign.status === 'running'
                      ? 'emerald'
                      : currentCampaign.status === 'completed'
                      ? 'default'
                      : 'amber'
                  }
                  dot
                >
                  {currentCampaign.status}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Target Audience: <strong className="text-slate-800 font-semibold">{metrics?.totalAudience ?? 0} unique contacts</strong>
              {' '}&bull;{' '}Dispatched: <strong className="text-slate-800 font-semibold">{metrics?.dispatched ?? 0}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-semibold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          <span>Every recipient counted exactly once &bull; Capped at 100%</span>
        </div>
      </div>

      {/* 5 Core Required Metrics (Large, High Contrast, Intuitive) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Metric 1: Messages Delivered */}
        <Card className="p-4 space-y-2 border-emerald-200/80 bg-gradient-to-b from-white to-emerald-50/20 shadow-xs hover:border-emerald-300 transition-colors">
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">1. Delivered</span>
            <div className="p-1.5 rounded-md bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-extrabold text-slate-900">{metrics?.delivered ?? 0}</div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-300">
              {metrics?.deliveryRate ?? 0}%
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium leading-tight">
            Messages delivered to candidate phones
          </p>
        </Card>

        {/* Metric 2: Messages Read */}
        <Card className="p-4 space-y-2 border-sky-200/80 bg-gradient-to-b from-white to-sky-50/20 shadow-xs hover:border-sky-300 transition-colors">
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-800">2. Read</span>
            <div className="p-1.5 rounded-md bg-sky-100 text-sky-700">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-extrabold text-slate-900">{metrics?.read ?? 0}</div>
            <span className="text-xs font-bold text-sky-700 bg-sky-100/80 px-2 py-0.5 rounded-full border border-sky-300">
              {metrics?.readRate ?? 0}%
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium leading-tight">
            Read receipts confirmed by recipients
          </p>
        </Card>

        {/* Metric 3: Sent Reply */}
        <Card className="p-4 space-y-2 border-indigo-200/80 bg-gradient-to-b from-white to-indigo-50/20 shadow-xs hover:border-indigo-300 transition-colors">
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-800">3. Sent Reply</span>
            <div className="p-1.5 rounded-md bg-indigo-100 text-indigo-700">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-extrabold text-slate-900">{metrics?.replied ?? 0}</div>
            <span className="text-xs font-bold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-full border border-indigo-300">
              {metrics?.replyRate ?? 0}%
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium leading-tight">
            Unique candidates who replied to bot
          </p>
        </Card>

        {/* Metric 4: Transferred to Human */}
        <Card className="p-4 space-y-2 border-amber-200/80 bg-gradient-to-b from-white to-amber-50/20 shadow-xs hover:border-amber-300 transition-colors">
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">4. To Human</span>
            <div className="p-1.5 rounded-md bg-amber-100 text-amber-700">
              <Headphones className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-extrabold text-slate-900">{metrics?.humanEscalated ?? 0}</div>
            <span className="text-xs font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full border border-amber-300">
              {metrics?.humanHandoffRate ?? 0}%
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium leading-tight">
            Transferred to human agent for help
          </p>
        </Card>

        {/* Metric 5: Completed Whole Workflow */}
        <Card className="p-4 space-y-2 border-purple-200/80 bg-gradient-to-b from-white to-purple-50/20 shadow-xs hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-800">5. Completed</span>
            <div className="p-1.5 rounded-md bg-purple-100 text-purple-700">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-2xl font-extrabold text-slate-900">{metrics?.completedGoal ?? 0}</div>
            <span className="text-xs font-bold text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded-full border border-purple-300">
              {metrics?.goalCompletionRate ?? 0}%
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium leading-tight">
            Finished the whole workflow screening
          </p>
        </Card>
      </div>

      {/* Conversion Funnel Section */}
      <Card className="p-6 bg-white border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Recipient Conversion Progression Funnel
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tracking distinct candidates step-by-step from dispatch to completion
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            Audience Base: {metrics?.totalAudience ?? 0}
          </span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
            Computing deduplicated funnel metrics...
          </div>
        ) : funnelStages.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            No recipients dispatched yet.
          </div>
        ) : (
          <div className="space-y-4">
            {funnelStages.map((stage, idx) => {
              const isFinal = idx === funnelStages.length - 1;
              const widthPercent = Math.max(stage.percentageOfTop, stage.count > 0 ? 8 : 2);

              return (
                <div key={stage.stage} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-slate-900 text-white font-bold flex items-center justify-center text-[11px]">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-slate-900">{stage.stage}</span>
                      <span className="text-[11px] text-slate-400 hidden sm:inline">
                        — {stage.description}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-900 text-sm">
                        {stage.count} <span className="text-[10px] text-slate-400 font-normal">recipients</span>
                      </span>
                      <span className="text-xs font-bold text-slate-700 w-12 text-right">
                        {stage.percentageOfTop}%
                      </span>
                    </div>
                  </div>

                  {/* Funnel Progress Bar */}
                  <div className="w-full bg-slate-100 rounded-lg h-7 overflow-hidden flex items-center p-1 border border-slate-200">
                    <div
                      className={`h-full rounded-md transition-all duration-500 flex items-center px-3 text-white text-[10px] font-bold shadow-2xs ${
                        stage.stage.includes('Completed')
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600'
                          : stage.stage.includes('Human')
                          ? 'bg-gradient-to-r from-amber-500 to-amber-600'
                          : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500'
                      }`}
                      style={{ width: `${widthPercent}%` }}
                    >
                      {widthPercent > 14 && `${stage.count} unique contacts`}
                    </div>
                  </div>

                  {/* Drop-off Callout */}
                  {!isFinal && stage.dropOffCount > 0 && (
                    <div className="flex items-center justify-between px-3 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600">
                      <span className="flex items-center gap-1 font-medium">
                        <TrendingDown className="w-3 h-3 text-amber-600" />
                        Drop-off to next step: -{stage.dropOffCount} contacts
                      </span>
                      <span className="font-bold text-slate-700">{stage.dropOffRate}% drop</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Granular Recipient Breakdown Table */}
      <Card className="p-0 overflow-hidden bg-white border-slate-200 shadow-xs">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Recipient Verification & Status Ledger
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live recipient-by-recipient status verifying exact delivery, read, reply, and completion
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search candidate or phone..."
                value={recipientSearch}
                onChange={(e) => setRecipientSearch(e.target.value)}
                className="text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-56 bg-slate-50"
              />
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {filteredRecipients.length} recipients
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Candidate / Phone</th>
                <th className="px-4 py-3 text-center">Delivered</th>
                <th className="px-4 py-3 text-center">Read</th>
                <th className="px-4 py-3 text-center">Sent Reply</th>
                <th className="px-4 py-3 text-center">Transferred to Human</th>
                <th className="px-4 py-3 text-center">Completed Workflow</th>
                <th className="px-4 py-3 text-right">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecipients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No matching recipients found for this selection.
                  </td>
                </tr>
              ) : (
                filteredRecipients.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Candidate Info */}
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{rec.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">{rec.phone}</div>
                    </td>

                    {/* Delivered */}
                    <td className="px-4 py-3 text-center">
                      {rec.delivered ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Delivered
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>

                    {/* Read */}
                    <td className="px-4 py-3 text-center">
                      {rec.read ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                          <Eye className="w-3 h-3 text-sky-600" /> Read
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>

                    {/* Replied */}
                    <td className="px-4 py-3 text-center">
                      {rec.replied ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                          <MessageSquare className="w-3 h-3 text-indigo-600" /> Replied
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>

                    {/* Transferred to Human */}
                    <td className="px-4 py-3 text-center">
                      {rec.transferredToHuman ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-300">
                          <Headphones className="w-3 h-3 text-amber-600" /> Yes (Escalated)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                          Automated Bot
                        </span>
                      )}
                    </td>

                    {/* Completed Workflow */}
                    <td className="px-4 py-3 text-center">
                      {rec.completedWorkflow ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                          <CheckCheck className="w-3 h-3 text-purple-600" /> Completed
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">In Progress</span>
                      )}
                    </td>

                    {/* Last Activity */}
                    <td className="px-4 py-3 text-right text-slate-500 font-mono text-[11px]">
                      {rec.lastActivityAt ? new Date(rec.lastActivityAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
