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
  Sparkles,
  Trash2
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

const STARTER_TEMPLATES = {
  recruitment_yes_no: {
    label: 'Interactive YES / NO Screening (Recommended)',
    desc: 'WhatsApp outreach with native quick-reply buttons (YES / NO), branch routing, and automatic contact tagging.',
    icon: MessageSquare,
    nodes: [
      {
        id: 'step_1_trigger',
        name: 'Trigger: Campaign or Inbound Keyword',
        type: 'trigger',
        config: { keywords: ['APPLY', 'HI'], channel: 'whatsapp', _position: { x: 260, y: 30 } },
        nextStepId: 'step_2_outreach'
      },
      {
        id: 'step_2_outreach',
        name: 'WhatsApp Outreach (Native YES/NO Buttons)',
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
        name: 'Screening Complete',
        type: 'terminate',
        config: { reason: 'Screening flow completed', _position: { x: 260, y: 920 } }
      }
    ]
  },
  survey_excel_sync: {
    label: 'Two-Way Survey Verification & Excel Sync',
    desc: 'Verify candidate submissions against Google Sheets or Excel Online and auto-tag upon confirmation.',
    icon: FileSpreadsheet,
    nodes: [
      {
        id: 'step_1_trigger',
        name: 'Trigger: Outreach Dispatched',
        type: 'trigger',
        config: { channel: 'whatsapp', _position: { x: 260, y: 30 } },
        nextStepId: 'step_2_send_survey'
      },
      {
        id: 'step_2_send_survey',
        name: 'Send Survey Link with Confirmation Button',
        type: 'send_message',
        config: {
          messageTemplate: 'Hi {{firstName}}, please complete the technical screening survey here: https://forms.gle/FlowDeskSurvey. Once completed, tap below:',
          buttons: [
            { id: 'btn_done', title: 'I HAVE SUBMITTED' }
          ],
          _position: { x: 260, y: 190 }
        },
        nextStepId: 'step_3_verify_sheet'
      },
      {
        id: 'step_3_verify_sheet',
        name: 'Verify Candidate Submission in Excel/Sheets',
        type: 'verify_data',
        config: {
          provider: 'google_sheets',
          sheetName: 'Responses',
          matchField: 'phone',
          _position: { x: 260, y: 380 }
        },
        nextStepId: 'step_4_tag_verified'
      },
      {
        id: 'step_4_tag_verified',
        name: 'Tag Contact: Survey Verified',
        type: 'update_record',
        config: {
          operations: [
            { action: 'add_tag', value: 'survey_verified' },
            { action: 'add_tag', value: 'ready_for_interview' }
          ],
          _position: { x: 260, y: 560 }
        },
        nextStepId: 'step_5_notify'
      },
      {
        id: 'step_5_notify',
        name: 'Send Confirmation Message',
        type: 'send_message',
        config: {
          messageTemplate: 'Thank you {{firstName}}! Your submission has been verified in our system. Our recruiter will reach out shortly.',
          _position: { x: 260, y: 740 }
        },
        nextStepId: 'step_6_terminate'
      },
      {
        id: 'step_6_terminate',
        name: 'Workflow Complete',
        type: 'terminate',
        config: { reason: 'Survey verified and logged', _position: { x: 260, y: 920 } }
      }
    ]
  },
  blank: {
    label: 'Blank Canvas (Custom Sequence)',
    desc: 'Start with a minimal trigger and message node to build your own custom flow from scratch.',
    icon: Sparkles,
    nodes: [
      {
        id: 'step_1_trigger',
        name: 'Workflow Trigger',
        type: 'trigger',
        config: { channel: 'whatsapp', _position: { x: 260, y: 40 } },
        nextStepId: 'step_2_message'
      },
      {
        id: 'step_2_message',
        name: 'Send WhatsApp Message',
        type: 'send_message',
        config: {
          messageTemplate: 'Hello {{firstName}}, welcome to FlowDesk! How can we assist you today?',
          _position: { x: 260, y: 220 }
        },
        nextStepId: null
      }
    ]
  }
};

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

  // Workflow creation state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDesc, setNewWorkflowDesc] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof STARTER_TEMPLATES>('recruitment_yes_no');
  const [isCreatingWorkflow, setIsCreatingWorkflow] = useState(false);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async (preferredId?: string) => {
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
        const target = preferredId
          ? normalizedWorkflows.find((w) => w.id === preferredId || w._id === preferredId) || normalizedWorkflows[0]
          : normalizedWorkflows[0];
        setSelectedWorkflow(target);
        if (target.steps && target.steps.length > 0) {
          setSelectedStep(target.steps[0]);
        }
        if (target.id) {
          loadExecutions(target.id);
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
          steps: STARTER_TEMPLATES.recruitment_yes_no.nodes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        setWorkflows([fallbackWorkflow]);
        setSelectedWorkflow(fallbackWorkflow);
        setSelectedStep(fallbackWorkflow.steps[0]);
      }
    } catch (err) {
      console.error('Failed to load workflows:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadExecutions = async (workflowId?: string) => {
    if (!workflowId) return;
    try {
      const res = await api.get<any[]>(`/workflows/${workflowId}/executions`);
      if (res.success && Array.isArray(res.data)) {
        setExecutions(res.data);
      } else {
        setExecutions([]);
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

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkflowName.trim()) return;

    setIsCreatingWorkflow(true);
    try {
      const selectedStarter = STARTER_TEMPLATES[selectedTemplate];
      const res = await api.post<any>('/workflows', {
        name: newWorkflowName.trim(),
        description: newWorkflowDesc.trim() || undefined,
        nodes: selectedStarter.nodes,
        isPublished: true
      });

      if (res.success && res.data) {
        setIsCreateModalOpen(false);
        setNewWorkflowName('');
        setNewWorkflowDesc('');
        const newId = res.data.id || res.data._id;
        await loadWorkflows(newId);
        setActiveTab('canvas');
      } else {
        alert(`Failed to create workflow: ${res.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Failed to create workflow: ${err.message || 'Server error'}`);
    } finally {
      setIsCreatingWorkflow(false);
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!selectedWorkflow) return;
    const wfId = selectedWorkflow.id || selectedWorkflow._id;
    if (!wfId || wfId.startsWith('wf-')) {
      alert('Cannot delete the built-in system default template.');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete "${selectedWorkflow.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/workflows/${wfId}`);
      await loadWorkflows();
    } catch (err: any) {
      alert(`Failed to delete workflow: ${err.message || 'Error occurred'}`);
    }
  };

  const handleSaveWorkflow = async (updatedNodes: any[]) => {
    if (!selectedWorkflow) return;
    setIsSaving(true);
    try {
      const wfId = selectedWorkflow.id || selectedWorkflow._id;
      if (wfId && !wfId.startsWith('wf-')) {
        const updateRes = await api.put(`/workflows/${wfId}`, { nodes: updatedNodes });
        if (!updateRes.success) {
          throw new Error(updateRes.error || 'Failed to update workflow');
        }
        await loadWorkflows(wfId);
      } else {
        const createRes = await api.post<any>('/workflows', {
          name: selectedWorkflow.name.replace(' (Built-in)', ''),
          description: selectedWorkflow.description,
          nodes: updatedNodes,
          isPublished: true
        });
        if (createRes.success && createRes.data) {
          const newId = createRes.data.id || createRes.data._id;
          await loadWorkflows(newId);
          return;
        } else {
          throw new Error(createRes.error || 'Failed to create workflow');
        }
      }
      // Update local state
      setSelectedWorkflow((prev) => (prev ? { ...prev, steps: updatedNodes } : null));
    } catch (err: any) {
      console.error('Failed to save workflow:', err);
      alert(`Failed to save workflow: ${err.message || 'Validation or network error'}`);
      throw err;
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
              variant="primary"
              size="sm"
              onClick={() => setIsCreateModalOpen(true)}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>Create Workflow</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSimulateModalOpen(true)}
              className="gap-2 border-emerald-300 text-emerald-800 hover:bg-emerald-50"
            >
              <Send className="w-3.5 h-3.5 text-emerald-600" />
              <span>Test Live on Mobile</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadWorkflows()}
              className="gap-2 text-slate-600 hover:text-slate-900"
              title="Reload workflow definitions"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Refresh</span>
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
              className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 max-w-sm truncate"
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
            {selectedWorkflow && !selectedWorkflow.id?.startsWith('wf-') && (
              <Button
                variant="ghost"
                size="xs"
                onClick={handleDeleteWorkflow}
                className="text-slate-400 hover:text-rose-600 p-1.5 ml-0.5 rounded-lg hover:bg-rose-50"
                title="Delete this workflow"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              </Button>
            )}
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
          <div className="flex-1 p-6 overflow-hidden flex flex-col h-full min-h-0">
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
            <aside className="w-full md:w-96 bg-white border-l border-slate-200 flex flex-col h-full overflow-hidden shrink-0">
              <div
                className="flex-1 overflow-y-auto min-h-0 p-6 space-y-6 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-400"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 #f1f5f9' }}
              >
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

                    {/* WhatsApp Message Interactive Buttons Preview */}
                    {selectedStep.type === 'send_message' && (
                      <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                            WhatsApp Message Output
                          </label>
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                            {(selectedStep.config?.buttons || []).length > 0 ? 'Interactive' : 'Plain Text'}
                          </span>
                        </div>

                        <p className="p-2.5 rounded-lg bg-white border border-emerald-200 text-xs font-mono text-slate-800 leading-relaxed">
                          {selectedStep.config?.messageTemplate || selectedStep.config?.body || 'Hello {{firstName}}!'}
                        </p>

                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Buttons Rendered on Candidate Mobile:
                          </span>
                          {(selectedStep.config?.buttons || []).length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {(selectedStep.config?.buttons || []).map((btn: any, bIdx: number) => (
                                <span
                                  key={bIdx}
                                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 text-white flex items-center gap-1.5 shadow-2xs"
                                >
                                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                  {btn.title}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="p-2 rounded bg-sky-50 border border-sky-200 text-[11px] text-sky-900 flex items-center gap-1.5">
                              <Send className="w-3.5 h-3.5 text-sky-600" />
                              <span>Normal Reply (No Buttons Attached)</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

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
              </div>

              <div className="p-4 border-t border-slate-200 shrink-0 bg-white">
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

        {/* Tab 3: Execution Runs */}
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

      {/* Create New Workflow Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Automation Workflow"
        description="Design a WhatsApp candidate recruitment DAG with interactive buttons, conditional branches, and external verification."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateWorkflow} className="space-y-4 mt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Workflow Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Senior Backend Dev Screening (YES/NO)"
              value={newWorkflowName}
              onChange={(e) => setNewWorkflowName(e.target.value)}
              className="w-full text-xs font-medium bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              placeholder="Brief note on what this recruitment sequence accomplishes"
              value={newWorkflowDesc}
              onChange={(e) => setNewWorkflowDesc(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Choose Starter Blueprint:
            </label>
            <div className="grid grid-cols-1 gap-2.5">
              {(Object.keys(STARTER_TEMPLATES) as Array<keyof typeof STARTER_TEMPLATES>).map((key) => {
                const tpl = STARTER_TEMPLATES[key];
                const Icon = tpl.icon;
                const isSelected = selectedTemplate === key;
                return (
                  <div
                    key={key}
                    onClick={() => setSelectedTemplate(key)}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/70 shadow-xs ring-1 ring-emerald-400'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`p-1.5 rounded-lg shrink-0 ${
                          isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">{tpl.label}</span>
                          {isSelected && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                              Selected
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{tpl.desc}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={isCreatingWorkflow}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={isCreatingWorkflow}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              <span>Create & Open Canvas</span>
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
