import React, { useEffect, useState, useId } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Send,
  CheckCircle2,
  Eye,
  MessageSquare,
  Award,
  AlertTriangle,
  RotateCcw,
  GitBranch,
  Filter,
  BarChart3,
  HelpCircle,
  ArrowRight,
  ShieldAlert,
  ChevronRight,
  RefreshCw
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

interface WorkflowStepDropOff {
  stepId: string;
  stepName: string;
  stepType: string;
  promptPreview: string;
  contactsReached: number;
  contactsCompleted: number;
  contactsDroppedHere: number;
  dropOffRate: number;
  isHighAbandonment: boolean;
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

export const Analytics: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const selectedCampaignId = searchParams.get('campaignId') || 'all';
  const selectedTimeRange = searchParams.get('timeRange') || 'all';

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [workflowDropOff, setWorkflowDropOff] = useState<{
    hasWorkflow: boolean;
    workflowName?: string;
    totalEnrolled: number;
    steps: WorkflowStepDropOff[];
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'funnel' | 'stepDropoff' | 'campaigns'>('funnel');

  const campaignSelectId = useId();
  const timeRangeSelectId = useId();

  // Load list of campaigns for the selector
  useEffect(() => {
    async function fetchCampaigns() {
      try {
        const res = await api.get<any>('/campaigns?limit=100');
        if (res.data) {
          const list = Array.isArray(res.data) ? res.data : (res.data.campaigns || []);
          setCampaigns(list);
        }
      } catch (err: any) {
        console.error('Failed to load campaigns for analytics selector', err);
      }
    }
    fetchCampaigns();
  }, []);

  // Fetch metrics & funnel whenever filters change
  const loadAnalyticsData = async () => {
    setIsLoading(true);
    try {
      const campParam = selectedCampaignId !== 'all' ? `&campaignId=${selectedCampaignId}` : '';
      const timeParam = selectedTimeRange !== 'all' ? `&timeRange=${selectedTimeRange}` : '';

      const [overviewRes, funnelRes] = await Promise.all([
        api.get<OverviewMetrics>(`/analytics/overview?${campParam}${timeParam}`),
        api.get<{ stages: FunnelStage[] }>(`/analytics/funnel?${campParam}`)
      ]);

      if (overviewRes.data) {
        setMetrics(overviewRes.data);
      }
      if (funnelRes.data?.stages) {
        setFunnelStages(funnelRes.data.stages);
      }

      // If a specific campaign is chosen, fetch step drop-off
      if (selectedCampaignId !== 'all') {
        const dropRes = await api.get<any>(`/analytics/step-dropoff?campaignId=${selectedCampaignId}`);
        if (dropRes.data) {
          setWorkflowDropOff(dropRes.data);
        }
      } else {
        setWorkflowDropOff(null);
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

  // Recalculate historical stats to eliminate duplicates
  const handleRecalculate = async () => {
    setIsSyncing(true);
    try {
      const body = selectedCampaignId !== 'all' ? { campaignId: selectedCampaignId } : {};
      await api.post('/analytics/recalculate', body);
      await loadAnalyticsData();
      alert('Campaign engagement statistics synchronized and cleansed of duplicate message receipts.');
    } catch (err: any) {
      alert(`Sync failed: ${err.message || 'Unknown error'}`);
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

  const selectedCampaignName =
    selectedCampaignId === 'all'
      ? 'All Campaigns (Aggregated)'
      : campaigns.find((c) => c.id === selectedCampaignId)?.name || 'Selected Campaign';

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 p-6 space-y-6">
      {/* Top Header & Global Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Campaign Analytics & Conversion Funnel</h1>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
              Unique Contacts
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time contact progression, conversion stages, and workflow question drop-off diagnostics
          </p>
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Campaign Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-sm">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <label htmlFor={campaignSelectId} className="sr-only">Campaign</label>
            <select
              id={campaignSelectId}
              value={selectedCampaignId}
              onChange={(e) => handleCampaignFilterChange(e.target.value)}
              className="text-xs text-slate-800 font-medium bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer pr-2 max-w-[200px] truncate"
            >
              <option value="all">📊 All Campaigns (Aggregated)</option>
              {campaigns.map((camp) => (
                <option key={camp.id} value={camp.id}>
                  {camp.name} ({camp.status})
                </option>
              ))}
            </select>
          </div>

          {/* Time Range Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-sm">
            <label htmlFor={timeRangeSelectId} className="sr-only">Time Range</label>
            <select
              id={timeRangeSelectId}
              value={selectedTimeRange}
              onChange={(e) => handleTimeRangeChange(e.target.value)}
              className="text-xs text-slate-800 font-medium bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer"
            >
              <option value="all">📅 All Time</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>

          {/* Sync Stats Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecalculate}
            disabled={isSyncing}
            className="text-slate-700 border-slate-300 hover:bg-slate-100 shadow-sm"
            title="Recalculate and cleanse metrics from duplicate message receipts"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 text-slate-500 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync & Cleanse'}
          </Button>
        </div>
      </div>

      {/* KPI Cards (High Impact, Unique-Contact Centric) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Audience */}
        <Card className="p-3.5 space-y-1 bg-white border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Audience</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics?.totalAudience ?? 0}</div>
          <p className="text-[10px] text-slate-500">Total contacts targeted</p>
        </Card>

        {/* Delivery Rate */}
        <Card className="p-3.5 space-y-1 bg-white border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Delivered</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics?.deliveryRate ?? 0}%</div>
          <p className="text-[10px] text-emerald-600 font-medium">
            {metrics?.delivered ?? 0} of {metrics?.dispatched ?? 0} reached
          </p>
        </Card>

        {/* Read Rate */}
        <Card className="p-3.5 space-y-1 bg-white border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Read Rate</span>
            <Eye className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics?.readRate ?? 0}%</div>
          <p className="text-[10px] text-sky-600 font-medium">
            {metrics?.read ?? 0} contacts opened
          </p>
        </Card>

        {/* Response Rate */}
        <Card className="p-3.5 space-y-1 bg-white border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Response Rate</span>
            <MessageSquare className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics?.replyRate ?? 0}%</div>
          <p className="text-[10px] text-indigo-600 font-medium">
            {metrics?.replied ?? 0} unique contacts engaged
          </p>
        </Card>

        {/* Goal Conversion */}
        <Card className="p-3.5 space-y-1 bg-white border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Goal Reached</span>
            <Award className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics?.goalCompletionRate ?? 0}%</div>
          <p className="text-[10px] text-purple-600 font-medium">
            {metrics?.completedGoal ?? 0} reached campaign target
          </p>
        </Card>

        {/* Human Escalated */}
        <Card className="p-3.5 space-y-1 bg-white border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Human Handoff</span>
            <ShieldAlert className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{metrics?.humanHandoffRate ?? 0}%</div>
          <p className="text-[10px] text-amber-600 font-medium">
            {metrics?.humanEscalated ?? 0} escalated to agents
          </p>
        </Card>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('funnel')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === 'funnel'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          Conversion Funnel
        </button>

        <button
          onClick={() => setActiveTab('stepDropoff')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === 'stepDropoff'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          Workflow Question Drop-off
          {selectedCampaignId !== 'all' && (
            <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded font-bold">
              Active
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('campaigns')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            activeTab === 'campaigns'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Campaign Comparisons ({campaigns.length})
        </button>
      </div>

      {/* TAB 1: CONVERSION FUNNEL CASCADE */}
      {activeTab === 'funnel' && (
        <Card className="p-6 bg-white border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                End-to-End Progression Funnel: {selectedCampaignName}
              </h2>
              <p className="text-xs text-slate-500">
                Visualizing how distinct recipients convert from initial broadcast to terminal goal
              </p>
            </div>
            <span className="text-xs text-slate-400">Total Stages: {funnelStages.length}</span>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
              Computing conversion rates...
            </div>
          ) : funnelStages.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No campaign dispatches recorded for this selection yet.
            </div>
          ) : (
            <div className="space-y-4">
              {funnelStages.map((stage, idx) => {
                const isFinal = idx === funnelStages.length - 1;
                const widthPercent = Math.max(stage.percentageOfTop, 6);

                return (
                  <div key={stage.stage} className="space-y-1.5">
                    {/* Stage Header */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px]">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-slate-800">{stage.stage}</span>
                        <span className="text-[11px] text-slate-400 hidden sm:inline">
                          — {stage.description}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-900 text-sm">{stage.count}</span>
                        <span className="text-[11px] font-semibold text-slate-500 w-12 text-right">
                          {stage.percentageOfTop}%
                        </span>
                      </div>
                    </div>

                    {/* Funnel Progress Bar */}
                    <div className="w-full bg-slate-100 rounded-lg h-7 overflow-hidden flex items-center p-1 border border-slate-200">
                      <div
                        className="h-full rounded-md transition-all duration-500 flex items-center px-3 text-white text-[10px] font-bold shadow-sm bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500"
                        style={{ width: `${widthPercent}%` }}
                      >
                        {widthPercent > 15 && `${stage.count} contacts`}
                      </div>
                    </div>

                    {/* Drop-off Callout between steps */}
                    {!isFinal && stage.dropOffCount > 0 && (
                      <div className="flex items-center justify-between px-3 py-1 bg-amber-50/70 border border-amber-200/60 rounded text-[11px] text-amber-800">
                        <span className="flex items-center gap-1 font-medium">
                          <TrendingDown className="w-3 h-3 text-amber-600" />
                          Drop-off to next stage: -{stage.dropOffCount} contacts
                        </span>
                        <span className="font-bold text-amber-700">{stage.dropOffRate}% drop</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* TAB 2: WORKFLOW QUESTION DROP-OFF DIAGNOSTICS */}
      {activeTab === 'stepDropoff' && (
        <Card className="p-6 bg-white border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Step-by-Step Question & Abandonment Analysis
              </h2>
              <p className="text-xs text-slate-500">
                Detect exactly which questions or interactive steps cause contacts to stop responding
              </p>
            </div>

            {selectedCampaignId === 'all' && (
              <span className="text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 font-medium">
                Tip: Select a specific campaign from the dropdown above to view its node-by-node flow
              </span>
            )}
          </div>

          {selectedCampaignId === 'all' ? (
            <div className="py-12 text-center text-slate-500 space-y-3">
              <GitBranch className="w-10 h-10 text-purple-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-800">Select a Specific Campaign</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Step drop-off diagnostics require inspecting an individual campaign's workflow structure. Choose one from the dropdown above to pinpoint exact friction points.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {campaigns.slice(0, 5).map((c) => (
                  <Button
                    key={c.id}
                    size="xs"
                    variant="outline"
                    onClick={() => handleCampaignFilterChange(c.id)}
                  >
                    {c.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : !workflowDropOff?.hasWorkflow ? (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <HelpCircle className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-700">No Automated Workflow Linked</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                This campaign was launched as a standard template broadcast without multi-step interactive logic.
              </p>
            </div>
          ) : workflowDropOff.steps.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No contacts have reached the workflow steps yet.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs bg-purple-50 text-purple-900 px-4 py-2.5 rounded-lg border border-purple-200">
                <span className="font-semibold">
                  Workflow: <span className="font-bold">{workflowDropOff.workflowName}</span>
                </span>
                <span>Enrolled Contacts: <strong className="font-bold">{workflowDropOff.totalEnrolled}</strong></span>
              </div>

              <div className="space-y-3">
                {workflowDropOff.steps.map((st, i) => (
                  <div
                    key={st.stepId}
                    className={`p-4 rounded-xl border transition-all ${
                      st.isHighAbandonment
                        ? 'border-amber-300 bg-amber-50/30'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-md bg-slate-900 text-white font-bold flex items-center justify-center text-xs">
                          {i + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">{st.stepName}</span>
                            <Badge variant={st.stepType === 'condition' ? 'indigo' : st.stepType === 'terminate' ? 'default' : 'sky'}>
                              {st.stepType}
                            </Badge>
                            {st.isHighAbandonment && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-600" /> High Drop-off
                              </span>
                            )}
                          </div>
                          {st.promptPreview && (
                            <p className="text-[11px] text-slate-500 mt-0.5 italic">
                              "{st.promptPreview}"
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Numbers */}
                      <div className="flex items-center gap-4 text-xs">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block uppercase font-bold">Reached</span>
                          <span className="font-bold text-slate-800">{st.contactsReached}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-emerald-600 block uppercase font-bold">Completed</span>
                          <span className="font-bold text-emerald-700">{st.contactsCompleted}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-rose-500 block uppercase font-bold">Dropped Here</span>
                          <span className="font-bold text-rose-600">{st.contactsDroppedHere}</span>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar of Completion */}
                    <div className="mt-3 w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${st.contactsReached > 0 ? (st.contactsCompleted / st.contactsReached) * 100 : 0}%`
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* TAB 3: CAMPAIGNS PERFORMANCE COMPARISON TABLE */}
      {activeTab === 'campaigns' && (
        <Card className="p-0 overflow-hidden bg-white border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Campaign Comparison Ledger</h2>
              <p className="text-xs text-slate-500">Side-by-side unique engagement and conversion rates</p>
            </div>
            <span className="text-xs text-slate-400">{campaigns.length} campaigns</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Audience / Dispatched</th>
                  <th className="px-4 py-3">Delivered</th>
                  <th className="px-4 py-3">Read Rate</th>
                  <th className="px-4 py-3">Unique Replies</th>
                  <th className="px-4 py-3">Goal Reached</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      No campaigns found.
                    </td>
                  </tr>
                ) : (
                  campaigns.map((camp) => {
                    const disp = camp.stats?.dispatched || 0;
                    const del = camp.stats?.delivered || 0;
                    const rd = camp.stats?.read || 0;
                    const rep = camp.stats?.replied || 0;
                    const goal = camp.stats?.completedGoal || 0;

                    const delRate = disp > 0 ? Math.round((del / disp) * 100) : 0;
                    const readRate = del > 0 ? Math.round((rd / del) * 100) : 0;
                    const replyRate = del > 0 ? Math.round((rep / del) * 100) : 0;

                    return (
                      <tr key={camp.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          <div>{camp.name}</div>
                          {camp.workflowId && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200 mt-1">
                              <GitBranch className="w-2.5 h-2.5" />
                              {camp.workflowId.name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={camp.status === 'active' || camp.status === 'running' ? 'emerald' : camp.status === 'completed' ? 'default' : 'amber'}>
                            {camp.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {disp} / {camp.stats?.totalContacts || disp}
                        </td>
                        <td className="px-4 py-3 text-emerald-700 font-medium">
                          {del} ({delRate}%)
                        </td>
                        <td className="px-4 py-3 text-sky-700 font-medium">
                          {rd} ({readRate}%)
                        </td>
                        <td className="px-4 py-3 text-indigo-700 font-bold">
                          {rep} ({replyRate}%)
                        </td>
                        <td className="px-4 py-3 text-purple-700 font-bold">
                          {goal}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              handleCampaignFilterChange(camp.id);
                              setActiveTab('funnel');
                            }}
                          >
                            Inspect Funnel <ChevronRight className="w-3 h-3 ml-0.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
