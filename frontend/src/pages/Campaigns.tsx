import React, { useEffect, useState } from 'react';
import {
  Send,
  Plus,
  Play,
  RotateCcw,
  Trash2,
  CheckCircle2,
  Eye,
  MessageSquare,
  Users,
  Clock,
  Layers,
  AlertCircle,
  GitBranch,
  Sparkles
} from 'lucide-react';
import { api } from '../lib/api.js';
import { Button } from '../components/ui/Button.js';
import { Badge } from '../components/ui/Badge.js';
import { Card } from '../components/ui/Card.js';
import { Modal } from '../components/ui/Modal.js';
import { Input } from '../components/ui/Input.js';

interface CampaignItem {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'completed' | 'paused' | 'cancelled';
  contactListId?: {
    id: string;
    name: string;
    totalCount: number;
  };
  workflowId?: {
    id: string;
    name: string;
  };
  buttons?: Array<{ id: string; title: string }>;
  stats: {
    totalContacts: number;
    dispatched: number;
    delivered: number;
    read: number;
    replied: number;
    converted: number;
    failed: number;
  };
  createdAt: string;
}

interface ContactListItem {
  id?: string;
  _id?: string;
  name: string;
  totalCount: number;
}

interface WorkflowItem {
  id?: string;
  _id?: string;
  name: string;
}

export const Campaigns: React.FC = () => {
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [contactLists, setContactLists] = useState<ContactListItem[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [useInteractiveButtons, setUseInteractiveButtons] = useState(true);
  const [buttons, setButtons] = useState<Array<{ id: string; title: string }>>([
    { id: 'btn_yes', title: 'YES' },
    { id: 'btn_no', title: 'NO' }
  ]);
  const [messageTemplate, setMessageTemplate] = useState(
    'Hi {{firstName}}, are you interested in the {{roleApplied}} role? Tap an option below:'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const [campRes, listRes, wfRes] = await Promise.all([
        api.get('/campaigns'),
        api.get('/contact-lists'),
        api.get('/workflows')
      ]);

      const normalizedLists = (listRes.data || []).map((l: any) => ({
        ...l,
        id: l.id || l._id,
        _id: l.id || l._id
      }));
      const normalizedWfs = (wfRes.data || []).map((w: any) => ({
        ...w,
        id: w.id || w._id,
        _id: w.id || w._id
      }));
      const normalizedCamps = (campRes.data || []).map((c: any) => ({
        ...c,
        id: c.id || c._id,
        _id: c.id || c._id
      }));

      setCampaigns(normalizedCamps);
      setContactLists(normalizedLists);
      setWorkflows(normalizedWfs);

      if (normalizedLists.length > 0 && !selectedListId) {
        setSelectedListId(normalizedLists[0].id);
      }
      if (normalizedWfs.length > 0 && !selectedWorkflowId) {
        setSelectedWorkflowId(normalizedWfs[0].id);
      }
    } catch (err) {
      console.error('Failed to load campaigns data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !selectedListId) return;

    setIsSubmitting(true);
    try {
      const isWorkflowDriven = Boolean(selectedWorkflowId);
      await api.post('/campaigns', {
        name: name.trim(),
        contactListId: selectedListId,
        workflowId: selectedWorkflowId || null,
        messageTemplate: isWorkflowDriven ? '[Workflow Driven]' : messageTemplate,
        buttons: isWorkflowDriven ? [] : (useInteractiveButtons ? buttons : [])
      });

      setIsCreateModalOpen(false);
      setName('');
      fetchData();
    } catch (err: any) {
      alert(`Campaign creation failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLaunchCampaign = async (campaignId: string) => {
    try {
      const res = await api.post(`/campaigns/${campaignId}/launch`);
      if (res.data?.data?.dispatched === 0 && res.data?.data?.failed > 0) {
        alert(
          `Warning: 0 of ${res.data.data.totalEnrolled} messages were sent. Meta rejected the dispatches (check if access token expired or numbers are registered).`
        );
      }
      fetchData();
    } catch (err: any) {
      alert(`Campaign launch failed: ${err.message}`);
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!window.confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) {
      return;
    }
    try {
      await api.delete(`/campaigns/${campaignId}`);
      fetchData();
    } catch (err: any) {
      alert(`Failed to delete campaign: ${err.message}`);
    }
  };

  // Aggregated Stats
  const totalDispatched = campaigns.reduce((acc, c) => acc + (c.stats?.dispatched || 0), 0);
  const totalDelivered = campaigns.reduce((acc, c) => acc + (c.stats?.delivered || 0), 0);
  const totalRead = campaigns.reduce((acc, c) => acc + (c.stats?.read || 0), 0);
  const totalReplied = campaigns.reduce((acc, c) => acc + (c.stats?.replied || 0), 0);

  const deliveryRate = totalDispatched > 0 ? Math.round((totalDelivered / totalDispatched) * 100) : 0;
  const readRate = totalDispatched > 0 ? Math.round((totalRead / totalDispatched) * 100) : 0;
  const replyRate = totalDispatched > 0 ? Math.round((totalReplied / totalDispatched) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 p-6 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Campaigns & Dispatches</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Launch automated WhatsApp broadcast workflows with template interpolation
          </p>
        </div>

        <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Create Campaign
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Dispatched</span>
            <Send className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalDispatched}</div>
          <p className="text-[11px] text-slate-400">Total WhatsApp messages sent</p>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Delivered</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{deliveryRate}%</div>
          <p className="text-[11px] text-emerald-600 font-medium">{totalDelivered} confirmed delivered</p>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Read Rate</span>
            <Eye className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{readRate}%</div>
          <p className="text-[11px] text-sky-600 font-medium">{totalRead} candidates opened</p>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Reply Engagement</span>
            <MessageSquare className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{replyRate}%</div>
          <p className="text-[11px] text-indigo-600 font-medium">{totalReplied} responses received</p>
        </Card>
      </div>

      {/* Campaigns Table */}
      <Card className="p-0 overflow-hidden border-slate-200">
        <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">All Campaigns</h3>
          <span className="text-xs text-slate-500">{campaigns.length} campaigns listed</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Campaign Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Contact List</th>
                <th className="px-4 py-3">Dispatched / Total</th>
                <th className="px-4 py-3">Delivered</th>
                <th className="px-4 py-3">Read</th>
                <th className="px-4 py-3">Replied</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No campaigns created yet. Click "Create Campaign" to get started.
                  </td>
                </tr>
              ) : (
                campaigns.map((camp) => (
                  <tr key={camp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div>{camp.name}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {camp.workflowId && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                            <GitBranch className="w-2.5 h-2.5" />
                            {camp.workflowId.name || 'Workflow'}
                          </span>
                        )}
                        {camp.buttons && camp.buttons.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            <MessageSquare className="w-2.5 h-2.5 text-emerald-600" />
                            Buttons ({camp.buttons.map((b) => b.title).join(' / ')})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {camp.status === 'running' && (
                        (camp.stats?.failed || 0) > 0 && (camp.stats?.dispatched || 0) === 0 ? (
                          <Badge variant="rose" dot>
                            Failed ({camp.stats.failed})
                          </Badge>
                        ) : (
                          <Badge variant="emerald" dot>
                            Running
                          </Badge>
                        )
                      )}
                      {camp.status === 'completed' && <Badge variant="default">Completed</Badge>}
                      {camp.status === 'draft' && <Badge variant="default">Draft</Badge>}
                      {camp.status === 'paused' && <Badge variant="amber">Paused</Badge>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        {camp.contactListId?.name || 'Contact List'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      <div>
                        {camp.stats?.dispatched || 0} / {camp.stats?.totalContacts || 0}
                      </div>
                      {(camp.stats?.failed || 0) > 0 && (
                        <div className="text-[10px] text-rose-500 font-medium">
                          {camp.stats.failed} failed
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-emerald-700 font-medium">
                      {camp.stats?.delivered || 0}
                    </td>
                    <td className="px-4 py-3 text-sky-700 font-medium">{camp.stats?.read || 0}</td>
                    <td className="px-4 py-3 text-indigo-700 font-medium">
                      {camp.stats?.replied || 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {camp.status === 'draft' && (
                          <Button
                            size="xs"
                            variant="primary"
                            onClick={() => handleLaunchCampaign(camp.id)}
                          >
                            <Play className="w-3 h-3 mr-1" /> Launch
                          </Button>
                        )}
                        {(camp.status === 'running' || camp.status === 'completed') && (
                          <>
                            {(camp.stats?.failed || 0) > 0 ? (
                              <Button
                                size="xs"
                                variant="outline"
                                className="text-amber-700 border-amber-300 hover:bg-amber-50"
                                onClick={() => handleLaunchCampaign(camp.id)}
                                title="Retry failed dispatches"
                              >
                                <RotateCcw className="w-3 h-3 mr-1" /> Retry
                              </Button>
                            ) : camp.status === 'running' ? (
                              <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                                <Clock className="w-3 h-3 animate-spin" /> Dispatched
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-slate-400">Archived</span>
                            )}
                          </>
                        )}
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-slate-400 hover:text-rose-600 p-1"
                          onClick={() => handleDeleteCampaign(camp.id)}
                          title="Delete Campaign"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Campaign Modal */}
      <Modal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        title="Create New WhatsApp Campaign"
        description="Configure target contact list, workflow, and personalized message template"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateCampaign} className="space-y-4">
          <Input
            label="Campaign Name"
            placeholder="e.g. Q4 Software Developer Recruitment"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Target Contact List</label>
              <select
                className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={selectedListId}
                onChange={(e) => setSelectedListId(e.target.value)}
                required
              >
                {contactLists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name} ({list.totalCount} contacts)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Automation Workflow</label>
              <select
                className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={selectedWorkflowId}
                onChange={(e) => setSelectedWorkflowId(e.target.value)}
              >
                <option value="">None (Standard Broadcast)</option>
                {workflows.map((wf) => (
                  <option key={wf.id} value={wf.id}>
                    ⚡ {wf.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedWorkflowId ? (
            <div className="p-4 bg-emerald-50/80 rounded-xl border border-emerald-200/90 space-y-2.5 animate-fade-in">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-600 text-white shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-emerald-950">
                    Automated Workflow Campaign
                  </h4>
                  <p className="text-[11px] text-emerald-700 font-medium truncate">
                    Driven by: {workflows.find((w) => w.id === selectedWorkflowId)?.name || 'Selected Workflow'}
                  </p>
                </div>
                <Badge variant="emerald" className="text-[10px] font-bold shrink-0">
                  DAG Controlled
                </Badge>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Your workflow DAG defines the initial outreach message, interactive YES/NO quick-reply buttons, applicant reply branching, and survey forms.
              </p>
              <div className="flex items-center gap-2 pt-2 text-[11px] text-emerald-800 font-semibold border-t border-emerald-200/60">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Manual message templates and button fields are bypassed.</span>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Message Template (Variable Interpolation)
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {`{{firstName}}, {{roleApplied}}`}
                  </span>
                </div>
                <textarea
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  required
                />
              </div>

              {/* Interactive Quick-Reply Buttons (YES / NO) */}
              <div className="p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-950 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useInteractiveButtons}
                      onChange={(e) => setUseInteractiveButtons(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                    />
                    Include Native WhatsApp Buttons (e.g. YES / NO)
                  </label>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                    Meta Interactive API
                  </span>
                </div>

                {useInteractiveButtons && (
                  <div className="space-y-2.5 pt-1">
                    <p className="text-[11px] text-slate-600">
                      Clickable buttons appear directly on the candidate's phone under the message. Tapping an option branches your automated workflow without manual typing.
                    </p>
                    <div className="flex items-center gap-2">
                      {buttons.map((btn, idx) => (
                        <div
                          key={idx}
                          className="flex-1 flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-emerald-300 shadow-2xs"
                        >
                          <span className="text-[10px] font-bold text-slate-400 pl-1">#{idx + 1}</span>
                          <input
                            type="text"
                            maxLength={20}
                            value={btn.title}
                            onChange={(e) => {
                              const updated = [...buttons];
                              updated[idx] = { ...updated[idx], title: e.target.value };
                              setButtons(updated);
                            }}
                            className="w-full text-xs font-bold text-emerald-900 focus:outline-none"
                            placeholder="Button Title"
                          />
                        </div>
                      ))}
                      {buttons.length < 3 && (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          className="text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                          onClick={() =>
                            setButtons([...buttons, { id: `btn_${buttons.length + 1}`, title: 'MORE INFO' }])
                          }
                        >
                          + Button
                        </Button>
                      )}
                    </div>

                    {/* Mobile Preview Box */}
                    <div className="mt-2 p-3 bg-emerald-900/5 rounded-lg border border-emerald-200/80">
                      <span className="text-[10px] uppercase font-bold text-emerald-800 block mb-1.5">
                        WhatsApp Recipient Screen Preview:
                      </span>
                      <div className="bg-white p-3 rounded-xl shadow-xs space-y-2 max-w-sm border border-slate-100">
                        <p className="text-slate-800 text-xs font-sans leading-relaxed">
                          {messageTemplate.replace('{{firstName}}', 'Aman').replace('{{roleApplied}}', 'Full Stack Engineer')}
                        </p>
                        <div className="border-t border-slate-100 pt-2 flex flex-col gap-1.5">
                          {buttons.map((btn, idx) => (
                            <div
                              key={idx}
                              className="w-full text-center py-1.5 px-3 rounded-lg bg-slate-50 border border-emerald-200 text-emerald-700 font-bold text-xs shadow-2xs flex items-center justify-center gap-1.5"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              {btn.title || `Button ${idx + 1}`}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 sticky bottom-0 bg-white py-2 z-10 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
              Create & Save Campaign
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

