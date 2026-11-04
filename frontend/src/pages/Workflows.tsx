import React, { useEffect, useState } from 'react';
import {
  GitBranch,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowDown,
  Layers,
  Radio,
  FileSpreadsheet,
  Cpu,
  ChevronRight,
  Database,
  RefreshCw,
  Plus,
  Send,
  MessageSquare,
  Sparkles
} from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { formatDate } from '../lib/utils';
import { WorkflowCanvas } from '../components/workflow-canvas/WorkflowCanvas';

interface WorkflowStep {
  id: string;
  name: string;
  type:
    | 'trigger'
    | 'send_message'
    | 'wait_for_reply'
    | 'ai_agent'
    | 'ai_conversation'
    | 'verify_data'
    | 'condition_branch'
    | 'condition'
    | 'update_contact'
    | 'update_record'
    | 'delay'
    | string;
  config: Record<string, any>;
  nextStepId?: string;
  onSuccessStepId?: string;
  onFailureStepId?: string;
  branches?: Array<{
    conditionType: string;
    conditionValue?: string | null;
    targetStepId: string;
  }>;
}

interface WorkflowItem {
  id: string;
  _id?: string;
  name: string;
  description?: string;
  status: 'draft' | 'published' | 'archived';
  isPublished?: boolean;
  version: number;
  trigger?: {
    type: string;
    keywords?: string[];
  };
  steps: WorkflowStep[];
  nodes?: any[];
  createdAt: string;
  updatedAt: string;
}

interface ExecutionItem {
  _id: string;
  workflowId: string;
  contactId?: {
    phoneNumber: string;
    firstName?: string;
  };
  status: 'in_progress' | 'completed' | 'failed' | 'waiting_for_reply';
  currentStepId: string;
  variables: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export const Workflows: React.FC = () => {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowItem | null>(null);
  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
  const [executions, setExecutions] = useState<ExecutionItem[]>([]);
  const [activeTab, setActiveTab] = useState<'canvas' | 'inspector' | 'executions'>('canvas');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Simulation test state
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [simulatePhone, setSimulatePhone] = useState('+918655021064');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulateFeedback, setSimulateFeedback] = useState<string | null>(null);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<any[]>('/workflows');
      if (res.success && res.data && res.data.length > 0) {
        const normalizedWorkflows: WorkflowItem[] = res.data.map((w: any) => {
          const rawNodes = w.nodes || w.steps || [];
          const steps: WorkflowStep[] = rawNodes.map((node: any) => {
            const successBranch = node.branches?.find((b: any) => b.conditionType === 'equals');
            const defaultBranch = node.branches?.find((b: any) => b.conditionType === 'default');

            return {
              id: node.id || `step_${Math.random().toString(36).substring(2, 7)}`,
              name: node.name || 'Workflow Step',
              type: node.type || 'send_message',
              config: node.config || {},
              nextStepId: node.nextStepId,
              branches: node.branches || [],
              onSuccessStepId: successBranch ? successBranch.targetStepId : node.onSuccessStepId,
              onFailureStepId: defaultBranch ? defaultBranch.targetStepId : node.onFailureStepId,
            };
          });

          const wfId = w.id || w._id || '';

          return {
            id: wfId,
            _id: wfId,
            name: w.name,
            description: w.description,
            status: w.isPublished ? 'published' : 'draft',
            isPublished: w.isPublished,
            version: w.version || 1,
            trigger: w.trigger || { type: 'inbound_message' },
            steps,
            createdAt: w.createdAt || new Date().toISOString(),
            updatedAt: w.updatedAt || new Date().toISOString(),
          };
        });

        setWorkflows(normalizedWorkflows);
        const first = normalizedWorkflows[0];
        setSelectedWorkflow(first);
        if (first.steps && first.steps.length > 0) {
          setSelectedStep(first.steps[0]);
        }
        if (first.id) {
          loadExecutions(first.id);
        }
      } else {
        // Provide standard recruitment DAG structure with native WhatsApp interactive buttons
        const fallbackWorkflow: WorkflowItem = {
          id: 'wf-recruitment-01',
          _id: 'wf-recruitment-01',
          name: 'Interactive Recruitment Screening (YES / NO)',
          description:
            'Autonomous candidate screening with native WhatsApp interactive quick-reply buttons (YES / NO), dynamic branching, and automatic tagging.',
          status: 'published',
          version: 1,
          trigger: {
            type: 'inbound_message',
            keywords: ['HI', 'APPLY', 'JOB', 'INTERVIEW']
          },
          steps: [
            {
              id: 'step_1_trigger',
              name: 'Campaign Outreach or Inbound Trigger',
              type: 'trigger',
              config: { keywords: ['APPLY', 'HI'], channel: 'whatsapp', _position: { x: 260, y: 30 } },
              nextStepId: 'step_2_outreach'
            },
            {
              id: 'step_2_outreach',
              name: 'WhatsApp Outreach (Interactive YES/NO Buttons)',
              type: 'send_message',
              config: {
                messageTemplate: 'Hi {{firstName}}, we have an exciting opening for {{role}} at {{company}}! Are you interested? Tap an option below:',
                buttons: [
                  { id: 'btn_yes', title: 'YES' },
                  { id: 'btn_no', title: 'NO' }
                ],
                _position: { x: 260, y: 190 }
              },
              nextStepId: 'step_3_decision'
            },
            {
              id: 'step_3_decision',
              name: 'Evaluate Button Choice',
              type: 'condition',
              config: {
                variablePath: 'lastReply',
                _position: { x: 260, y: 380 }
              },
              branches: [
                { conditionType: 'equals', conditionValue: 'YES', targetStepId: 'step_4_yes_path' },
                { conditionType: 'equals', conditionValue: 'NO', targetStepId: 'step_5_no_path' }
              ]
            },
            {
              id: 'step_4_yes_path',
              name: 'Send Application Form Link',
              type: 'send_message',
              config: {
                messageTemplate: 'Awesome {{firstName}}! Here is your application form: https://forms.gle/FlowDeskSurvey. Please complete it so we can schedule your interview!',
                _position: { x: 80, y: 560 }
              },
              nextStepId: 'step_6_tag_interested'
            },
            {
              id: 'step_5_no_path',
              name: 'Polite Acknowledgment & Archive',
              type: 'send_message',
              config: {
                messageTemplate: 'Thank you for letting us know, {{firstName}}. We will keep your resume on file for future opportunities. Best of luck!',
                _position: { x: 440, y: 560 }
              },
              nextStepId: 'step_7_tag_declined'
            },
            {
              id: 'step_6_tag_interested',
              name: 'Tag Contact: Interested',
              type: 'update_record',
              config: {
                operations: [
                  { action: 'add_tag', value: 'interested' },
                  { action: 'add_tag', value: 'survey_dispatched' }
                ],
                _position: { x: 80, y: 740 }
              },
              nextStepId: 'step_8_complete'
            },
            {
              id: 'step_7_tag_declined',
              name: 'Tag Contact: Opt-Out',
              type: 'update_record',
              config: {
                operations: [
                  { action: 'add_tag', value: 'opt_out' },
                  { action: 'add_tag', value: 'not_interested' }
                ],
                _position: { x: 440, y: 740 }
              },
              nextStepId: 'step_8_complete'
            },
            {
              id: 'step_8_complete',
              name: 'Workflow Execution Finished',
              type: 'terminate',
              config: { outcome: 'completed', _position: { x: 260, y: 920 } }
            }
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        try {
          const createRes = await api.post<any>('/workflows', {
            name: fallbackWorkflow.name,
            description: fallbackWorkflow.description,
            nodes: fallbackWorkflow.steps
          });
          if (createRes.success && createRes.data) {
            const saved = createRes.data;
            const normalized: WorkflowItem = {
              id: saved.id || saved._id,
              _id: saved.id || saved._id,
              name: saved.name,
              description: saved.description,
              status: 'published',
              version: saved.version || 1,
              steps: saved.nodes || fallbackWorkflow.steps,
              createdAt: saved.createdAt,
              updatedAt: saved.updatedAt
            };
            setWorkflows([normalized]);
            setSelectedWorkflow(normalized);
            setSelectedStep(normalized.steps[0]);
            return;
          }
        } catch {
          // Fallback to local state if backend route error
        }

        setWorkflows([fallbackWorkflow]);
        setSelectedWorkflow(fallbackWorkflow);
        setSelectedStep(fallbackWorkflow.steps[0]);
        loadExecutions(fallbackWorkflow.id);
      }
    } catch (err: any) {
      console.error('Failed to load workflows:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadExecutions = async (workflowId?: string) => {
    if (!workflowId || workflowId === 'undefined' || typeof workflowId !== 'string') {
      return;
    }

    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(workflowId);
    if (!isValidObjectId) {
      setExecutions([
        {
          _id: 'exec-101',
          workflowId,
          contactId: { phoneNumber: '+919876543210', firstName: 'Priya' },
          status: 'completed',
          currentStepId: 'step_6_route_interview',
          variables: { surveyVerified: true, score: 92 },
          createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
        },
        {
          _id: 'exec-102',
          workflowId,
          contactId: { phoneNumber: '+919876543211', firstName: 'Rahul' },
          status: 'in_progress',
          currentStepId: 'step_4_ai_qa',
          variables: { queryCount: 2 },
          createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString()
        },
        {
          _id: 'exec-103',
          workflowId,
          contactId: { phoneNumber: '+12025550199', firstName: 'David' },
          status: 'completed',
          currentStepId: 'step_6_route_interview',
          variables: { surveyVerified: true, score: 85 },
          createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 1.8 * 3600 * 1000).toISOString()
        }
      ]);
      return;
    }

    try {
      const res = await api.get<ExecutionItem[]>(
        `/workflows/${workflowId}/executions`
      );
      if (res.success && res.data && res.data.length > 0) {
        setExecutions(res.data);
      } else {
        // Fallback sample runs for immediate demo inspectability
        setExecutions([
          {
            _id: 'exec-101',
            workflowId,
            contactId: { phoneNumber: '+919876543210', firstName: 'Priya' },
            status: 'completed',
            currentStepId: 'step_6_route_interview',
            variables: { surveyVerified: true, score: 92 },
            createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
          },
          {
            _id: 'exec-102',
            workflowId,
            contactId: { phoneNumber: '+919876543211', firstName: 'Rahul' },
            status: 'in_progress',
            currentStepId: 'step_4_ai_qa',
            variables: { queryCount: 2 },
            createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString()
          },
          {
            _id: 'exec-103',
            workflowId,
            contactId: { phoneNumber: '+12025550199', firstName: 'David' },
            status: 'completed',
            currentStepId: 'step_6_route_interview',
            variables: { surveyVerified: true, score: 85 },
            createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 1.8 * 3600 * 1000).toISOString()
          }
        ]);
      }
    } catch (err) {
      console.error('Failed to load executions:', err);
    }
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'trigger':
        return <Radio className="w-4 h-4 text-sky-500" />;
      case 'send_message':
        return <Send className="w-4 h-4 text-emerald-500" />;
      case 'wait_for_reply':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'ai_agent':
      case 'ai_conversation':
        return <Cpu className="w-4 h-4 text-indigo-500" />;
      case 'verify_data':
        return <FileSpreadsheet className="w-4 h-4 text-emerald-600" />;
      case 'condition_branch':
      case 'condition':
        return <GitBranch className="w-4 h-4 text-purple-500" />;
      case 'update_contact':
      case 'update_record':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      default:
        return <Layers className="w-4 h-4 text-slate-500" />;
    }
  };

  const handleSaveWorkflow = async (updatedNodes: any[]) => {
    if (!selectedWorkflow) return;
    setIsSaving(true);
    try {
      const wfId = selectedWorkflow.id || selectedWorkflow._id;
      if (wfId && !wfId.startsWith('wf-')) {
        await api.put(`/workflows/${wfId}`, { nodes: updatedNodes });
      } else {
        const createRes = await api.post<any>('/workflows', {
          name: selectedWorkflow.name,
          description: selectedWorkflow.description,
          nodes: updatedNodes
        });
        if (createRes.success && createRes.data) {
          await loadWorkflows();
          return;
        }
      }
      // Update local state
      setSelectedWorkflow((prev) => (prev ? { ...prev, steps: updatedNodes } : null));
    } catch (err: any) {
      console.error('Failed to save workflow:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSimulateExecution = async () => {
    if (!selectedWorkflow) return;
    setIsSimulating(true);
    setSimulateFeedback(null);
    try {
      const wfId = selectedWorkflow.id || selectedWorkflow._id;
      const res = await api.post<any>(`/workflows/${wfId}/trigger-test`, {
        phone: simulatePhone,
        variables: {
          firstName: 'Aman',
          role: 'Full Stack Engineer',
          company: 'FlowDesk'
        }
      });

      if (res.success) {
        setSimulateFeedback(
          `🚀 Workflow triggered successfully for ${simulatePhone}! Execution ID: ${res.data?.id || 'live'}. An interactive WhatsApp message with [YES] and [NO] quick-reply buttons has been dispatched. Check your phone now!`
        );
        loadExecutions(wfId);
      } else {
        setSimulateFeedback(`Trigger error: ${res.error || 'Server returned error.'}`);
      }
    } catch (err: any) {
      setSimulateFeedback(`Connection error: ${err.message || 'Check backend status.'}`);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="px-8 py-5 bg-white border-b border-slate-200 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Workflows & DAG Automation
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Engine Active
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Visualize, inspect, and simulate multi-step WhatsApp recruitment sequences
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={loadWorkflows}
              className="gap-2"
              title="Reload workflow definitions"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Refresh</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsSimulateModalOpen(true)}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Simulate Candidate Execution</span>
            </Button>
          </div>
        </div>

        {/* Workflow Switcher & Sub-Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Selected Flow:
            </label>
            <select
              value={selectedWorkflow?.id || selectedWorkflow?._id || ''}
              onChange={(e) => {
                const wf = workflows.find((w) => (w.id === e.target.value || w._id === e.target.value));
                if (wf) {
                  setSelectedWorkflow(wf);
                  setSelectedStep(wf.steps[0] || null);
                  loadExecutions(wf.id || wf._id);
                }
              }}
              className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {workflows.map((wf) => (
                <option key={wf.id || wf._id} value={wf.id || wf._id}>
                  {wf.name} (v{wf.version})
                </option>
              ))}
            </select>
            <Badge variant="emerald" className="ml-1 uppercase text-[10px]">
              {selectedWorkflow?.status || 'published'}
            </Badge>
          </div>

          {/* Sub-Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-lg border border-slate-300">
            <button
              onClick={() => setActiveTab('canvas')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'canvas'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              Drag & Drop Canvas
            </button>
            <button
              onClick={() => setActiveTab('inspector')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'inspector'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              Step Inspector ({selectedWorkflow?.steps?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('executions')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'executions'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Play className="w-3.5 h-3.5 text-slate-500" />
              Live Runs ({executions.length})
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* TAB 1: Visual Drag & Drop Canvas (React Flow) */}
        {activeTab === 'canvas' && (
          <div className="flex-1 p-6 overflow-hidden">
            <WorkflowCanvas
              workflow={selectedWorkflow}
              onSave={handleSaveWorkflow}
              onTriggerTest={() => setIsSimulateModalOpen(true)}
              isSaving={isSaving}
            />
          </div>
        )}

        {/* TAB 2: Step Inspector (Classic DAG List) */}
        {activeTab === 'inspector' && (
          <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
            {/* Visual DAG Flow Canvas */}
            <div className="flex-1 overflow-y-auto p-8 bg-slate-100/70 border-r border-slate-200 flex flex-col items-center">
              <div className="w-full max-w-xl space-y-4 py-2">
                {(selectedWorkflow?.steps || []).map((step, idx) => {
                  const isSelected = selectedStep?.id === step.id;
                  const isBranchNode = step.type === 'verify_data' || step.type === 'condition_branch' || step.type === 'condition';

                  return (
                    <React.Fragment key={step.id}>
                      {/* Node Card */}
                      <div
                        onClick={() => setSelectedStep(step)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer bg-white ${
                          isSelected
                            ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
                            : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                              {getNodeIcon(step.type)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono font-bold uppercase text-slate-400">
                                  Step {idx + 1} • {step.type.replace('_', ' ')}
                                </span>
                              </div>
                              <h4 className="text-sm font-semibold text-slate-900 mt-0.5">
                                {step.name}
                              </h4>
                            </div>
                          </div>

                          <ChevronRight
                            className={`w-4 h-4 transition-transform ${
                              isSelected ? 'text-emerald-600 translate-x-0.5' : 'text-slate-300'
                            }`}
                          />
                        </div>

                        {/* Node Brief Summary */}
                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                          {step.type === 'verify_data' && (
                            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                              Google Sheets on Drive (Redis 60s Cache)
                            </span>
                          )}
                          {step.type === 'ai_agent' && (
                            <span className="inline-flex items-center gap-1.5 text-indigo-700 font-medium">
                              <Cpu className="w-3.5 h-3.5" />
                              Knowledge Base RAG + Tool Sandbox
                            </span>
                          )}
                          {step.type === 'send_message' && (
                            <span className="inline-flex items-center gap-1.5 text-slate-600">
                              <MessageSquare className="w-3.5 h-3.5" />
                              WhatsApp Template Dispatch
                            </span>
                          )}
                          {step.type === 'wait_for_reply' && (
                            <span className="inline-flex items-center gap-1.5 text-amber-700">
                              <Clock className="w-3.5 h-3.5" />
                              24h Candidate Timeout
                            </span>
                          )}
                          {step.type === 'trigger' && (
                            <span className="inline-flex items-center gap-1.5 text-sky-700">
                              <Radio className="w-3.5 h-3.5" />
                              Keywords: HI, APPLY, JOB
                            </span>
                          )}
                          {(step.type === 'update_contact' || step.type === 'update_record') && (
                            <span className="inline-flex items-center gap-1.5 text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Auto-Tag: survey_verified
                            </span>
                          )}
                          {(step.type === 'ai_agent' || step.type === 'ai_conversation') && (
                            <span className="inline-flex items-center gap-1.5 text-indigo-700">
                              <Cpu className="w-3.5 h-3.5" />
                              AI RAG Grounding Assistant
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Directional Connector Arrow */}
                      {idx < (selectedWorkflow?.steps.length || 0) - 1 && (
                        <div className="flex flex-col items-center justify-center my-1">
                          <div className="w-0.5 h-4 bg-slate-300" />
                          <ArrowDown className="w-4 h-4 text-slate-400 -my-1" />
                          <div className="w-0.5 h-4 bg-slate-300" />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Node Inspector Sidebar */}
            <aside className="w-full md:w-96 bg-white border-l border-slate-200 p-6 flex flex-col justify-between overflow-y-auto">
              {selectedStep ? (
                <div className="space-y-6">
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Node Inspector
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mt-2">{selectedStep.name}</h3>
                    <p className="text-xs font-mono text-slate-500 mt-1">ID: {selectedStep.id}</p>
                  </div>

                  {/* Node Type & Telemetry */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Node Type</span>
                      <span className="font-semibold text-slate-900 font-mono">
                        {selectedStep.type}
                      </span>
                    </div>

                    {selectedStep.nextStepId && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Next Step</span>
                        <span className="font-mono text-emerald-700 font-semibold">
                          {selectedStep.nextStepId}
                        </span>
                      </div>
                    )}

                    {selectedStep.onSuccessStepId && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">On Success</span>
                        <span className="font-mono text-emerald-700 font-semibold">
                          {selectedStep.onSuccessStepId}
                        </span>
                      </div>
                    )}

                    {selectedStep.onFailureStepId && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">On Failure</span>
                        <span className="font-mono text-rose-700 font-semibold">
                          {selectedStep.onFailureStepId}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* JSON Config Parameters */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Runtime Configuration
                    </label>
                    <pre className="p-3 bg-slate-900 text-slate-200 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800">
                      {JSON.stringify(selectedStep.config, null, 2)}
                    </pre>
                  </div>

                  {/* Architectural Verification Guarantees */}
                  {selectedStep.type === 'verify_data' && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1.5">
                      <p className="font-semibold flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        Verification Contract
                      </p>
                      <p className="text-[11px] text-emerald-700 leading-relaxed">
                        Evaluates candidate phone in Google Sheets on Google Drive. If row matches,
                        persists <code className="bg-emerald-100 px-1 rounded">surveyVerified: true</code> in
                        execution state, tags contact with <code className="bg-emerald-100 px-1 rounded">survey_verified</code>,
                        and transitions to <code className="bg-emerald-100 px-1 rounded">{selectedStep.onSuccessStepId}</code>.
                      </p>
                    </div>
                  )}

                  {(selectedStep.type === 'ai_agent' || selectedStep.type === 'ai_conversation') && (
                    <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-800 space-y-1.5">
                      <p className="font-semibold flex items-center gap-1.5">
                        <Cpu className="w-4 h-4 text-indigo-600" />
                        AI Agent Guardrails
                      </p>
                      <p className="text-[11px] text-indigo-700 leading-relaxed">
                        Grounded strictly on Knowledge Base articles. Sandboxed tools with Zod validation.
                        Escalates to human operator if user requests human or confidence drops below 0.60.
                      </p>
                    </div>
                  )}

                  {(selectedStep.type === 'update_contact' || selectedStep.type === 'update_record') && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1.5">
                      <p className="font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Candidate State & Tagging
                      </p>
                      <p className="text-[11px] text-emerald-700 leading-relaxed">
                        Applies qualified status, tags contact with <code className="bg-emerald-100 px-1 rounded">survey_verified</code>,
                        and schedules interview rounds.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <Layers className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-xs">Select a node to inspect parameters</p>
                </div>
              )}

              <div className="pt-6 border-t border-slate-200">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSimulateModalOpen(true)}
                  className="w-full justify-center gap-2 text-xs"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Test Run Node In Simulator</span>
                </Button>
              </div>
            </aside>
          </div>
        )}

        {/* Tab 2: Execution Runs */}
        {activeTab === 'executions' && (
          <div className="flex-1 p-8 overflow-y-auto">
            <Card className="border-slate-200 bg-white shadow-xs overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Execution ID</th>
                    <th className="py-3 px-4">Candidate</th>
                    <th className="py-3 px-4">Current Node</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Variables & Verification</th>
                    <th className="py-3 px-4">Started At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {executions.map((exec) => (
                    <tr key={exec._id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-800">
                        {exec._id}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {exec.contactId?.firstName || 'Candidate'}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {exec.contactId?.phoneNumber}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {exec.currentStepId}
                      </td>
                      <td className="py-3 px-4">
                        {exec.status === 'completed' ? (
                          <Badge variant="emerald" className="gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Completed</span>
                          </Badge>
                        ) : exec.status === 'in_progress' ? (
                          <Badge variant="sky" className="gap-1">
                            <Radio className="w-3 h-3 text-sky-600" />
                            <span>In Progress</span>
                          </Badge>
                        ) : (
                          <Badge variant="slate">{exec.status}</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {exec.variables.surveyVerified ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <FileSpreadsheet className="w-3 h-3" />
                            <span>Survey Verified (Drive)</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">In evaluation</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {formatDate(exec.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </div>

      {/* Workflow Real WhatsApp / Simulation Modal */}
      <Modal
        isOpen={isSimulateModalOpen}
        onClose={() => setIsSimulateModalOpen(false)}
        title="Test Workflow on Real WhatsApp Mobile"
        description="Dispatch this recruitment workflow directly to your WhatsApp mobile phone. When received, tap the [YES] or [NO] button on your screen to test real-time branching and automatic contact tagging."
      >
        <div className="space-y-4 mt-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target WhatsApp Mobile Number (E.164 with Country Code)
            </label>
            <input
              type="text"
              value={simulatePhone}
              onChange={(e) => setSimulatePhone(e.target.value)}
              placeholder="+918655021064"
              className="w-full text-xs font-mono bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <p className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              How the Live Interactive Test Works:
            </p>
            <p>1. FlowDesk dispatches an interactive WhatsApp message with native <strong>[YES]</strong> and <strong>[NO]</strong> buttons to your phone.</p>
            <p>2. Tap <strong>YES</strong> on your phone: Workflow branches to the positive route, sends the application link, and tags the contact <em>'interested'</em>.</p>
            <p>3. Tap <strong>NO</strong> on your phone: Workflow branches to opt-out, sends a polite acknowledgment, and tags <em>'opt_out'</em>.</p>
            <p>4. All messages appear live in the <strong>Team Inbox</strong> without page refresh.</p>
          </div>

          {simulateFeedback && (
            <div className={`p-3 rounded-lg text-xs leading-relaxed border ${
              simulateFeedback.includes('🚀')
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-medium'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              {simulateFeedback}
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-200">
            <Button variant="ghost" onClick={() => setIsSimulateModalOpen(false)}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={handleSimulateExecution}
              isLoading={isSimulating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Play className="w-3.5 h-3.5 mr-1.5" />
              <span>Dispatch to WhatsApp Mobile</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
