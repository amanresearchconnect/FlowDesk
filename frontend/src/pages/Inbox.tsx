import React, { useEffect, useState, useRef } from 'react';
import {
  Search,
  Send as SendIcon,
  Check,
  CheckCheck,
  UserCheck,
  Cpu,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  FileSpreadsheet,
  Tag,
  Phone,
  Calendar,
  MessageSquare,
  Sliders,
  Workflow as WorkflowIcon,
  Play,
  Pause,
  FastForward,
  Clock,
  Sparkles,
  Layers,
  HelpCircle,
  XCircle,
  Activity,
  ChevronDown,
  ChevronRight,
  RotateCw,
  ArrowRight
} from 'lucide-react';
import { api } from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { useAuthStore } from '../stores/auth.store.js';
import { Button } from '../components/ui/Button.js';
import { Badge } from '../components/ui/Badge.js';
import { formatDate, cn } from '../lib/utils.js';

interface ConversationItem {
  id: string;
  contactId: {
    _id: string;
    id: string;
    phone: string;
    firstName?: string;
    lastName?: string;
    tags?: string[];
    customFields?: Record<string, any>;
  };
  channel: string;
  status: 'bot' | 'human_needed' | 'agent_assigned' | 'closed';
  assignedUserId?: {
    _id: string;
    id: string;
    name: string;
  };
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadCount?: number;
}

interface MessageItem {
  id: string;
  direction: 'inbound' | 'outbound';
  senderType: 'system' | 'agent' | 'contact' | 'ai';
  senderUserId?: {
    id: string;
    name: string;
  };
  type: string;
  content: {
    body?: string;
    buttons?: Array<{ id?: string; title?: string; text?: string } | string>;
  };
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: string;
}

interface WorkflowExecutionData {
  execution: {
    id: string;
    status: 'running' | 'waiting_for_reply' | 'delayed' | 'completed' | 'failed' | 'paused_for_human';
    currentStepId: string;
    variables?: Record<string, any>;
    stepLogs?: Array<{
      stepId: string;
      stepType: string;
      status: 'started' | 'completed' | 'failed' | 'skipped';
      timestamp: string;
      inputPayload?: any;
      outputPayload?: any;
    }>;
    waitingForReplyUntil?: string;
    errorDetails?: string;
    updatedAt: string;
  };
  workflow: {
    id: string;
    name: string;
    nodes: Array<{
      id: string;
      name: string;
      type: string;
      nextStepId?: string;
      config?: Record<string, any>;
      branches?: Array<{
        conditionType: string;
        conditionValue?: string;
        targetStepId: string;
      }>;
    }>;
  };
}

export const Inbox: React.FC = () => {
  const { user } = useAuthStore();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'human_needed' | 'bot' | 'agent_assigned'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [simulatedReply, setSimulatedReply] = useState('');
  const [workflowData, setWorkflowData] = useState<WorkflowExecutionData | null>(null);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);
  const [isActionInProgress, setIsActionInProgress] = useState(false);
  
  // Available workflows & stage selection dropdown state
  const [availableWorkflows, setAvailableWorkflows] = useState<any[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [selectedStartStepId, setSelectedStartStepId] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch conversations
  const fetchConversations = async () => {
    try {
      const query: Record<string, any> = {};
      if (activeTab !== 'all') {
        query.status = activeTab;
      }
      if (searchQuery.trim()) {
        query.search = searchQuery.trim();
      }

      const res = await api.get('/conversations', query);
      setConversations(res.data);

      // Auto-select first conversation if none selected
      if (!selectedConversation && res.data.length > 0) {
        setSelectedConversation(res.data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [activeTab, searchQuery]);

  // Fetch available published workflows for dropdown selection
  useEffect(() => {
    const fetchAvailableWorkflows = async () => {
      try {
        const res = await api.get('/workflows');
        const list = res.data || [];
        setAvailableWorkflows(list);
        if (list.length > 0 && !selectedWorkflowId) {
          setSelectedWorkflowId(list[0].id || list[0]._id);
        }
      } catch (err) {
        console.error('Failed to fetch available workflows:', err);
      }
    };
    fetchAvailableWorkflows();
  }, []);

  const activeWorkflowDef =
    availableWorkflows.find((w) => (w.id || w._id) === selectedWorkflowId) ||
    workflowData?.workflow ||
    availableWorkflows[0];

  const handleSelectWorkflow = (wfId: string) => {
    setSelectedWorkflowId(wfId);
    const targetWf = availableWorkflows.find((w) => (w.id || w._id) === wfId);
    if (targetWf?.nodes?.length) {
      setSelectedStartStepId(targetWf.nodes[0].id);
    } else {
      setSelectedStartStepId('');
    }
  };

  // Sync selectedWorkflowId and selectedStartStepId when active workflow changes
  useEffect(() => {
    if (workflowData?.workflow?.id) {
      setSelectedWorkflowId(workflowData.workflow.id);
      if (workflowData.execution?.currentStepId) {
        setSelectedStartStepId(workflowData.execution.currentStepId);
      }
    }
  }, [workflowData?.workflow?.id, workflowData?.execution?.currentStepId]);

  useEffect(() => {
    if (activeWorkflowDef?.nodes?.length && !selectedStartStepId) {
      setSelectedStartStepId(activeWorkflowDef.nodes[0].id);
    }
  }, [activeWorkflowDef, selectedStartStepId]);

  // 2. Fetch messages & workflow execution for active conversation
  const fetchMessages = async (convId: string) => {
    try {
      const res = await api.get(`/conversations/${convId}/messages`);
      setMessages(res.data);
      // Mark read locally
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const fetchActiveExecution = async (convId: string) => {
    setIsLoadingWorkflow(true);
    try {
      const res = await api.get(`/conversations/${convId}/active-execution`);
      setWorkflowData(res.data || null);
    } catch (err) {
      console.error('Failed to fetch workflow execution:', err);
    } finally {
      setIsLoadingWorkflow(false);
    }
  };

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
      fetchActiveExecution(selectedConversation.id);
    }
  }, [selectedConversation?.id]);

  // Auto-scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 3. Socket.IO Real-Time Listeners & Room Management
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const activeConvId = selectedConversation?.id || (selectedConversation as any)?._id;

    // Join conversation room
    if (activeConvId) {
      socket.emit('join:conversation', activeConvId);
      socket.emit('conversation:join', activeConvId);
    }

    const handleMessageReceived = (payload: any) => {
      const incoming = payload.message || payload;
      const incomingConvId = String(incoming.conversationId || payload.conversationId || '');
      const currentConvId = String(activeConvId || '');

      // If message belongs to active thread, append it immediately
      if (currentConvId && incomingConvId === currentConvId) {
        setMessages((prev) => {
          const incomingId = incoming.id || incoming._id;
          if (prev.some((m) => (m.id || (m as any)._id) === incomingId)) return prev;
          return [...prev, incoming];
        });
      }
      // Refresh conversation list preview & unread counts
      fetchConversations();
    };

    const handleStatusUpdate = (payload: any) => {
      setMessages((prev) =>
        prev.map((m) =>
          (m.id || (m as any)._id) === payload.messageId || (m as any).providerMessageId === payload.providerMessageId
            ? { ...m, status: payload.status }
            : m
        )
      );
    };

    const handleEscalated = () => {
      fetchConversations();
    };

    const handleWorkflowProgress = (payload: any) => {
      const currentConvId = String(activeConvId || '');
      if (currentConvId && String(payload.conversationId) === currentConvId) {
        fetchActiveExecution(currentConvId);
      }
    };

    socket.on('message:received', handleMessageReceived);
    socket.on('message:status', handleStatusUpdate);
    socket.on('conversation:escalated', handleEscalated);
    socket.on('workflow:step_progress', handleWorkflowProgress);

    // Fallback polling every 4s to ensure real-time guarantee even across network blips
    const pollInterval = setInterval(() => {
      if (activeConvId) {
        fetchMessages(activeConvId);
        fetchConversations();
        fetchActiveExecution(activeConvId);
      }
    }, 4000);

    return () => {
      if (activeConvId) {
        socket.emit('leave:conversation', activeConvId);
        socket.emit('conversation:leave', activeConvId);
      }
      clearInterval(pollInterval);
      socket.off('message:received', handleMessageReceived);
      socket.off('message:status', handleStatusUpdate);
      socket.off('conversation:escalated', handleEscalated);
      socket.off('workflow:step_progress', handleWorkflowProgress);
    };
  }, [selectedConversation?.id, (selectedConversation as any)?._id]);

  // 4. Send Agent Reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation || !replyText.trim() || isSending) return;

    setIsSending(true);
    try {
      const res = await api.post(`/conversations/${selectedConversation.id}/messages`, {
        body: replyText.trim()
      });

      setMessages((prev) => [...prev, res.data]);
      setReplyText('');

      // Refresh thread
      fetchConversations();
    } catch (err: any) {
      alert(`Failed to send message: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  // 5. Agent Actions: Takeover, Release, Close
  const handleTakeover = async () => {
    if (!selectedConversation) return;
    try {
      const res = await api.post(`/conversations/${selectedConversation.id}/takeover`);
      setSelectedConversation(res.data);
      fetchConversations();
    } catch (err: any) {
      alert(`Takeover failed: ${err.message}`);
    }
  };

  const handleReleaseToBot = async () => {
    if (!selectedConversation) return;
    try {
      const res = await api.post(`/conversations/${selectedConversation.id}/release-to-bot`);
      setSelectedConversation(res.data);
      fetchConversations();
    } catch (err: any) {
      alert(`Release to bot failed: ${err.message}`);
    }
  };

  const handleClose = async () => {
    if (!selectedConversation) return;
    try {
      const res = await api.post(`/conversations/${selectedConversation.id}/close`);
      setSelectedConversation(res.data);
      fetchConversations();
    } catch (err: any) {
      alert(`Close failed: ${err.message}`);
    }
  };

  // Workflow Control Actions
  const handleStartOrRestartWorkflow = async (customStepId?: string) => {
    if (!selectedConversation) return;
    const wfId = selectedWorkflowId || workflowData?.workflow?.id || (availableWorkflows[0]?.id || availableWorkflows[0]?._id);
    if (!wfId) {
      alert('Please select a workflow to start.');
      return;
    }
    const stepToStart = customStepId || selectedStartStepId || undefined;
    setIsActionInProgress(true);
    try {
      await api.post(`/conversations/${selectedConversation.id}/workflow/start`, {
        workflowId: wfId,
        startStepId: stepToStart
      });
      await fetchActiveExecution(selectedConversation.id);
      await fetchMessages(selectedConversation.id);
      fetchConversations();
    } catch (err: any) {
      alert(`Failed to start workflow: ${err.message}`);
    } finally {
      setIsActionInProgress(false);
    }
  };

  const handlePauseWorkflow = async () => {
    if (!workflowData?.execution?.id) return;
    setIsActionInProgress(true);
    try {
      await api.post(`/workflows/executions/${workflowData.execution.id}/pause`);
      fetchActiveExecution(selectedConversation!.id);
      fetchConversations();
    } catch (err: any) {
      alert(`Pause failed: ${err.message}`);
    } finally {
      setIsActionInProgress(false);
    }
  };

  const handleResumeWorkflow = async () => {
    if (!workflowData?.execution?.id) return;
    setIsActionInProgress(true);
    try {
      await api.post(`/workflows/executions/${workflowData.execution.id}/resume`);
      fetchActiveExecution(selectedConversation!.id);
      fetchConversations();
    } catch (err: any) {
      alert(`Resume failed: ${err.message}`);
    } finally {
      setIsActionInProgress(false);
    }
  };

  const handleAdvanceStep = async (targetStepId: string, replyValue?: string) => {
    if (!workflowData?.execution?.id) {
      await handleStartOrRestartWorkflow(targetStepId);
      return;
    }
    setIsActionInProgress(true);
    try {
      await api.post(`/workflows/executions/${workflowData.execution.id}/advance`, {
        targetStepId,
        replyText: replyValue
      });
      fetchActiveExecution(selectedConversation!.id);
      fetchMessages(selectedConversation!.id);
      fetchConversations();
    } catch (err: any) {
      alert(`Advance failed: ${err.message}`);
    } finally {
      setIsActionInProgress(false);
    }
  };

  const handleJumpToStep = async (targetStepId: string, replyValue?: string) => {
    if (!workflowData?.execution?.id || ['completed', 'failed'].includes(workflowData.execution.status)) {
      await handleStartOrRestartWorkflow(targetStepId);
      return;
    }
    await handleAdvanceStep(targetStepId, replyValue);
  };

  // 6. Simulate Inbound Candidate Message (built-in simulator)
  const handleSimulateInbound = async (textToSend: string) => {
    if (!selectedConversation?.contactId?.phone) return;
    try {
      await api.post('/mock/whatsapp/incoming', {
        fromPhone: selectedConversation.contactId.phone,
        text: textToSend
      });
      setSimulatedReply('');
      // Give server 200ms to process AI agent response then refresh
      setTimeout(() => {
        if (selectedConversation) {
          fetchMessages(selectedConversation.id);
          fetchConversations();
        }
      }, 300);
    } catch (err: any) {
      alert(`Simulation failed: ${err.message}`);
    }
  };

  const contact = selectedConversation?.contactId;
  const isVerified = contact?.tags?.includes('survey_verified');

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-100">
      {/* ============================================================ */}
      {/* COLUMN 1: Conversation List & Filter Tabs                     */}
      {/* ============================================================ */}
      <div className="flex flex-col w-80 lg:w-96 bg-white border-r border-slate-200 shrink-0 h-full">
        {/* Header & Search */}
        <div className="p-3.5 border-b border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Team Inbox</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {conversations.length} Active
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search candidate name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 rounded-lg bg-slate-50 border border-slate-200 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-xs">
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium shrink-0 transition-colors',
                activeTab === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab('human_needed')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium shrink-0 flex items-center gap-1 transition-colors',
                activeTab === 'human_needed'
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
              )}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Needs Attention</span>
            </button>
            <button
              onClick={() => setActiveTab('bot')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium shrink-0 transition-colors',
                activeTab === 'bot'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              Bot Handled
            </button>
            <button
              onClick={() => setActiveTab('agent_assigned')}
              className={cn(
                'px-2.5 py-1 rounded-md font-medium shrink-0 transition-colors',
                activeTab === 'agent_assigned'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              Assigned
            </button>
          </div>
        </div>

        {/* Conversation Items List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {conversations.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-medium text-slate-500">No conversations in this view</p>
            </div>
          ) : (
            conversations.map((conv) => {
              const isSelected = selectedConversation?.id === conv.id;
              const contactName =
                `${conv.contactId?.firstName || ''} ${conv.contactId?.lastName || ''}`.trim() ||
                conv.contactId?.phone ||
                'Candidate';

              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={cn(
                    'p-3 cursor-pointer transition-colors relative',
                    isSelected ? 'bg-slate-100/90' : 'hover:bg-slate-50/80'
                  )}
                >
                  <div className="flex items-start justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-900 truncate max-w-[170px]">
                      {contactName}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {formatDate(conv.lastMessageAt)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 line-clamp-1 mb-2">
                    {conv.lastMessagePreview || 'New message'}
                  </p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {conv.status === 'human_needed' && (
                        <Badge variant="amber" dot>
                          Needs Human
                        </Badge>
                      )}
                      {conv.status === 'bot' && (
                        <Badge variant="indigo" dot>
                          AI Bot
                        </Badge>
                      )}
                      {conv.status === 'agent_assigned' && (
                        <Badge variant="emerald" dot>
                          {conv.assignedUserId?.name?.split(' ')[0] || 'Agent'}
                        </Badge>
                      )}
                      {conv.status === 'closed' && <Badge variant="default">Closed</Badge>}

                      {conv.contactId?.tags?.includes('survey_verified') && (
                        <span title="Survey Verified in Google Sheets">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        </span>
                      )}
                    </div>

                    {conv.unreadCount !== undefined && conv.unreadCount > 0 && (
                      <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* COLUMN 2: Chat Canvas & Active Message Thread                */}
      {/* ============================================================ */}
      {selectedConversation ? (
        <div className="flex-1 flex flex-col h-full bg-[#f8fafc] min-w-0 border-r border-slate-200/60">
          {/* Thread Header */}
          <div className="h-16 px-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-slate-900 text-white font-bold text-sm flex items-center justify-center shadow-xs">
                  {selectedConversation.contactId?.firstName?.charAt(0) || 'C'}
                </div>
                <span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white absolute -bottom-0.5 -right-0.5" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    {`${selectedConversation.contactId?.firstName || ''} ${selectedConversation.contactId?.lastName || ''}`.trim() || 'Candidate'}
                  </h3>
                  <span className="text-xs text-slate-500 font-mono bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/60">
                    {selectedConversation.contactId?.phone}
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    WhatsApp
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs mt-0.5">
                  {selectedConversation.status === 'human_needed' && (
                    <span className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Candidate Requested Human Assistance
                    </span>
                  )}
                  {selectedConversation.status === 'bot' && (
                    <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                      <Cpu className="w-3.5 h-3.5 text-emerald-600" />
                      Automated Screening Bot Active
                    </span>
                  )}
                  {selectedConversation.status === 'agent_assigned' && (
                    <span className="text-[11px] font-semibold text-purple-700 flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-purple-600" />
                      Human Agent Assigned ({selectedConversation.assignedUserId?.name || 'Agent'})
                    </span>
                  )}
                  {selectedConversation.status === 'closed' && (
                    <span className="text-[11px] font-medium text-slate-400">
                      Thread Closed
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Agent Action Controls */}
            <div className="flex items-center gap-2">
              {selectedConversation.status !== 'agent_assigned' ? (
                <Button size="sm" variant="primary" onClick={handleTakeover} className="gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  Take Over Chat
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReleaseToBot}
                  className="gap-1.5 text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Release to Bot
                </Button>
              )}

              <Button size="sm" variant="secondary" onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>

          {/* Messages Scrollable Canvas */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-100/60">
            {/* Thread Start Date Marker */}
            <div className="flex justify-center my-1">
              <span className="px-3 py-0.5 rounded-full bg-white/90 border border-slate-200 text-[10px] font-semibold text-slate-500 shadow-2xs uppercase tracking-wider">
                End-to-End Encrypted WhatsApp Session
              </span>
            </div>

            {messages.map((msg) => {
              const isCandidate = msg.direction === 'inbound';
              const isBot = msg.senderType === 'ai' || msg.senderType === 'system';
              const isAgent = msg.senderType === 'agent';

              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex flex-col max-w-[75%]',
                    isCandidate ? 'mr-auto items-start' : 'ml-auto items-end'
                  )}
                >
                  <div
                    className={cn(
                      'px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-xs relative group transition-all',
                      isCandidate
                        ? 'bg-white text-slate-900 rounded-tl-xs border border-slate-200/90'
                        : isAgent
                        ? 'bg-[#d9fdd3] text-slate-950 rounded-tr-xs border border-[#b2e8a6]'
                        : 'bg-white/95 text-slate-900 rounded-tr-xs border border-emerald-200/90 border-l-4 border-l-emerald-600'
                    )}
                  >
                    {/* Sender Identity Header */}
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider">
                      {isCandidate ? (
                        <span className="text-slate-500 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          Candidate
                        </span>
                      ) : isAgent ? (
                        <span className="text-emerald-800 flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                          Agent ({msg.senderUserId?.name || 'Recruiter'})
                        </span>
                      ) : (
                        <span className="text-emerald-700 flex items-center gap-1 font-semibold">
                          <Cpu className="w-3 h-3 text-emerald-600" />
                          Screening Bot (Automated)
                        </span>
                      )}
                    </div>

                    {/* Message Body Content */}
                    <p className="whitespace-pre-wrap text-slate-800 font-normal leading-relaxed text-[13px]">
                      {msg.content?.body}
                    </p>

                    {/* WhatsApp Native Interactive Buttons Visualizer */}
                    {msg.content?.buttons && Array.isArray(msg.content.buttons) && msg.content.buttons.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-slate-200/70 space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          WhatsApp Native Buttons:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.content.buttons.map((btn: any, bIdx: number) => {
                            const btnTitle = typeof btn === 'string' ? btn : (btn.title || btn.text || 'Option');
                            return (
                              <div
                                key={bIdx}
                                className="px-3 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 shadow-2xs flex items-center gap-1.5"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {btnTitle}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Footer: Timestamp & Delivery Status */}
                    <div className="flex items-center justify-end gap-1 mt-1.5 text-[10px] text-slate-400">
                      <span>{formatDate(msg.createdAt)}</span>
                      {!isCandidate && (
                        <span>
                          {msg.status === 'read' ? (
                            <span title="Read by candidate"><CheckCheck className="w-3.5 h-3.5 text-sky-500" /></span>
                          ) : msg.status === 'delivered' ? (
                            <span title="Delivered"><CheckCheck className="w-3.5 h-3.5 text-slate-400" /></span>
                          ) : (
                            <span title="Sent"><Check className="w-3.5 h-3.5 text-slate-400" /></span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Workflow Interrupted / On-Hold Notice Banner */}
          {(selectedConversation.status === 'agent_assigned' || workflowData?.execution?.status === 'paused_for_human') && (
            <div className="mx-4 my-2 p-2.5 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-3 shadow-2xs shrink-0">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <span className="font-semibold block text-amber-950">Workflow Automation Interrupted / On Hold</span>
                  <span className="text-[11px] text-amber-700">An agent intervened. Automated WhatsApp replies are paused until resumed.</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="primary"
                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1"
                  onClick={handleResumeWorkflow}
                  disabled={isActionInProgress}
                >
                  <Play className="w-3 h-3" /> Resume Bot
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-amber-300 text-amber-800 bg-white hover:bg-amber-50 gap-1"
                  onClick={() => handleStartOrRestartWorkflow()}
                  disabled={isActionInProgress}
                >
                  <RotateCw className="w-3 h-3" /> Restart Flow
                </Button>
              </div>
            </div>
          )}

          {/* Quick Simulation Toolbar (Instant Recruiter & Candidate Testing) */}
          <div className="px-4 py-2 bg-slate-200/70 border-t border-slate-300/80 flex items-center justify-between text-xs text-slate-600 shrink-0">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5 text-xs">
              <Sliders className="w-3.5 h-3.5 text-emerald-600" />
              Candidate Quick Replies:
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button
                onClick={() => handleSimulateInbound('YES')}
                className="px-2.5 py-0.5 bg-white hover:bg-slate-50 rounded-md border border-slate-300 font-mono text-[11px] font-semibold text-emerald-800 transition-colors"
              >
                "YES"
              </button>
              <button
                onClick={() => handleSimulateInbound('NO')}
                className="px-2.5 py-0.5 bg-white hover:bg-slate-50 rounded-md border border-slate-300 font-mono text-[11px] font-semibold text-rose-700 transition-colors"
              >
                "NO"
              </button>
              <button
                onClick={() => handleSimulateInbound('3-5 Years')}
                className="px-2.5 py-0.5 bg-white hover:bg-slate-50 rounded-md border border-slate-300 text-[11px] font-medium transition-colors"
              >
                "3-5 Years"
              </button>
              <button
                onClick={() => handleSimulateInbound('Immediate (< 15 days)')}
                className="px-2.5 py-0.5 bg-white hover:bg-slate-50 rounded-md border border-slate-300 text-[11px] font-medium transition-colors"
              >
                "Immediate"
              </button>
              <button
                onClick={() => handleSimulateInbound('What is the role location?')}
                className="px-2.5 py-0.5 bg-white hover:bg-slate-50 rounded-md border border-slate-300 text-[11px] transition-colors"
              >
                "Role Location?"
              </button>
              <button
                onClick={() => handleSimulateInbound('I need to speak to a human recruiter')}
                className="px-2.5 py-0.5 bg-white hover:bg-slate-50 rounded-md border border-slate-300 text-amber-700 text-[11px] font-medium transition-colors"
              >
                "Need Human"
              </button>
            </div>
          </div>

          {/* Message Input Box */}
          <form
            onSubmit={handleSendReply}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0 shadow-xs"
          >
            <input
              type="text"
              placeholder={
                selectedConversation.status === 'bot'
                  ? 'Type an agent message to take over automatically from bot...'
                  : 'Type a WhatsApp message to candidate...'
              }
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="flex-1 h-10 px-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={!replyText.trim() || isSending}
              isLoading={isSending}
              className="rounded-xl px-4"
            >
              <SendIcon className="w-4 h-4" />
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
          <MessageSquare className="w-12 h-12 text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-600">Select a candidate conversation</p>
          <p className="text-xs text-slate-400">Or use the simulator on the left to start a thread.</p>
        </div>
      )}

      {/* ============================================================ */}
      {/* ============================================================ */}
      {/* COLUMN 3: Candidate & Active Workflow Journey Sidebar        */}
      {/* ============================================================ */}
      {selectedConversation && (
        <div className="w-80 lg:w-96 bg-white border-l border-slate-200 h-full overflow-y-auto p-4 space-y-5 shrink-0 hidden xl:block">
          
          {/* Active Workflow Automation Controller & Stepper Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <WorkflowIcon className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Workflow Controller
                </span>
              </div>
              {workflowData?.execution ? (
                <span
                  className={cn(
                    'text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider',
                    workflowData.execution.status === 'waiting_for_reply' && 'bg-amber-100 text-amber-800 border border-amber-200',
                    workflowData.execution.status === 'running' && 'bg-blue-100 text-blue-800 border border-blue-200',
                    workflowData.execution.status === 'paused_for_human' && 'bg-purple-100 text-purple-800 border border-purple-200',
                    workflowData.execution.status === 'completed' && 'bg-emerald-100 text-emerald-800 border border-emerald-200',
                    workflowData.execution.status === 'failed' && 'bg-rose-100 text-rose-800 border border-rose-200'
                  )}
                >
                  {workflowData.execution.status.replace(/_/g, ' ')}
                </span>
              ) : (
                <span className="text-[10px] bg-slate-200/70 text-slate-600 font-medium px-2 py-0.5 rounded-full">
                  Inactive
                </span>
              )}
            </div>

            {/* Workflow & Stage Selection Dropdowns */}
            <div className="space-y-2 bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Select Automation Workflow
                </label>
                <div className="relative">
                  <select
                    value={selectedWorkflowId}
                    onChange={(e) => handleSelectWorkflow(e.target.value)}
                    className="w-full text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-md py-1.5 pl-2.5 pr-7 appearance-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {availableWorkflows.map((wf) => (
                      <option key={wf.id || wf._id} value={wf.id || wf._id}>
                        {wf.name}
                      </option>
                    ))}
                    {availableWorkflows.length === 0 && (
                      <option value="">No workflows available</option>
                    )}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Select Stage to Resume / Start From
                </label>
                <div className="relative">
                  <select
                    value={selectedStartStepId}
                    onChange={(e) => setSelectedStartStepId(e.target.value)}
                    className="w-full text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-md py-1.5 pl-2.5 pr-7 appearance-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {(activeWorkflowDef?.nodes || []).map((node: any, idx: number) => (
                      <option key={node.id} value={node.id}>
                        Stage {idx + 1}: {node.name} ({node.type})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2.5 pointer-events-none" />
                </div>
              </div>

              {/* Action Buttons: Run Selected Stage & Restart Workflow */}
              <div className="pt-1.5 flex flex-col gap-1.5">
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full text-xs h-7 gap-1.5 bg-emerald-600 hover:bg-emerald-700 shadow-xs"
                  onClick={() => handleStartOrRestartWorkflow(selectedStartStepId)}
                  disabled={isActionInProgress || !selectedStartStepId}
                  isLoading={isActionInProgress}
                >
                  <Play className="w-3 h-3 fill-current" />
                  Run from Selected Stage
                </Button>

                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-7 gap-1 text-slate-700 border-slate-200 hover:bg-slate-50 px-2 truncate"
                    onClick={() => handleStartOrRestartWorkflow()}
                    disabled={isActionInProgress}
                    title="Restart workflow from Stage 1"
                  >
                    <RotateCw className="w-3 h-3 text-slate-500 shrink-0" />
                    Restart Flow
                  </Button>

                  {workflowData?.execution?.status === 'paused_for_human' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[11px] h-7 gap-1 text-emerald-700 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/50 px-2 truncate"
                      onClick={handleResumeWorkflow}
                      disabled={isActionInProgress}
                    >
                      <Play className="w-3 h-3 shrink-0" />
                      Resume Bot
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[11px] h-7 gap-1 text-purple-700 border-purple-200 bg-purple-50/50 hover:bg-purple-100/50 px-2 truncate"
                      onClick={handlePauseWorkflow}
                      disabled={isActionInProgress || !workflowData?.execution || ['completed', 'failed'].includes(workflowData?.execution?.status)}
                    >
                      <Pause className="w-3 h-3 shrink-0" />
                      Pause Bot
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Live Stepper Timeline */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                <span className="text-[11px] font-semibold text-slate-700">
                  Live Stage Stepper
                </span>
                <span className="text-[10px] text-slate-400">
                  Click any stage to run
                </span>
              </div>

              <div className="space-y-2.5 relative pl-2 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200">
                {(activeWorkflowDef?.nodes || []).map((node: any, idx: number) => {
                  const isCurrent = workflowData?.execution?.currentStepId === node.id;
                  const log = (workflowData?.execution?.stepLogs || []).slice().reverse().find((l: any) => l.stepId === node.id);
                  const isCompleted = log?.status === 'completed';
                  const isFailed = log?.status === 'failed';

                  return (
                    <div key={node.id} className="relative flex items-start gap-2.5 group">
                      {/* Step Marker */}
                      <div
                        className={cn(
                          'w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold z-10 transition-all cursor-pointer',
                          isCompleted && 'bg-emerald-600 text-white shadow-xs',
                          isFailed && 'bg-rose-600 text-white',
                          isCurrent && workflowData?.execution?.status === 'waiting_for_reply' && 'bg-amber-500 text-white ring-4 ring-amber-100 animate-pulse',
                          isCurrent && workflowData?.execution?.status === 'paused_for_human' && 'bg-purple-600 text-white ring-4 ring-purple-100',
                          isCurrent && workflowData?.execution?.status === 'running' && 'bg-blue-600 text-white ring-4 ring-blue-100',
                          !isCompleted && !isFailed && !isCurrent && 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        )}
                        onClick={() => handleJumpToStep(node.id)}
                        title={`Click to jump and run ${node.name}`}
                      >
                        {isCompleted ? (
                          <Check className="w-3 h-3 stroke-[3]" />
                        ) : isFailed ? (
                          <XCircle className="w-3 h-3" />
                        ) : (
                          idx + 1
                        )}
                      </div>

                      {/* Step Details */}
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={cn(
                              'text-xs font-medium truncate',
                              isCurrent ? 'text-slate-900 font-bold' : isCompleted ? 'text-slate-700' : 'text-slate-500'
                            )}
                          >
                            {node.name}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {isCurrent && (
                              <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded">
                                Active
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleJumpToStep(node.id)}
                              disabled={isActionInProgress}
                              className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-800 border border-slate-200 transition-colors flex items-center gap-0.5"
                              title="Run directly from this stage"
                            >
                              <Play className="w-2 h-2 fill-current" />
                              Run
                            </button>
                          </div>
                        </div>

                        {/* Step Type Pill */}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] uppercase tracking-wider text-slate-400 font-mono">
                            {node.type}
                          </span>
                        </div>

                        {/* Branch or Reply Preview if present */}
                        {log?.inputPayload?.replyText && (
                          <p className="text-[10px] text-emerald-700 font-mono mt-0.5 bg-emerald-50/60 px-1.5 py-0.5 rounded border border-emerald-100">
                            ↳ Answered: "{log.inputPayload.replyText}"
                          </p>
                        )}

                        {isCurrent && workflowData?.execution?.status === 'waiting_for_reply' && (
                          <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5 font-medium">
                            <Clock className="w-3 h-3 shrink-0" />
                            Awaiting candidate WhatsApp reply...
                          </p>
                        )}

                        {/* Interactive Branch Options / Fast-forward buttons */}
                        {isCurrent && node.branches && node.branches.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {node.branches.map((branch: any, bIdx: number) => (
                              <button
                                key={bIdx}
                                onClick={() => handleAdvanceStep(branch.targetStepId, branch.conditionValue || 'SIMULATED')}
                                disabled={isActionInProgress}
                                className="text-[10px] font-medium px-2 py-0.5 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 rounded border border-slate-300 transition-colors flex items-center gap-1"
                                title={`Simulate response and branch to step ${branch.targetStepId}`}
                              >
                                <FastForward className="w-2.5 h-2.5 text-slate-400" />
                                {branch.conditionValue || 'Default'}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Runtime Variables Card */}
              {workflowData?.execution?.variables && Object.keys(workflowData.execution.variables).length > 0 && (
                <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1.5 text-[11px] shadow-xs">
                  <span className="font-semibold text-slate-700 block text-[10px] uppercase tracking-wider">
                    Collected Candidate Data:
                  </span>
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {Object.entries(workflowData.execution.variables)
                      .filter(([k]) => !['lastReplyAt', 'candidateSurveyId'].includes(k))
                      .map(([key, val]) => (
                        <div key={key} className="flex justify-between text-slate-600 font-mono text-[10px] py-0.5 border-b border-slate-100 last:border-none">
                          <span className="text-slate-500">{key}:</span>
                          <span className="font-semibold text-slate-900">{String(val ?? 'null')}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Candidate Dossier */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              Candidate Dossier
            </h4>
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> Phone
                </span>
                <span className="font-mono font-medium text-slate-900">{contact?.phone}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Channel
                </span>
                <span className="text-slate-900 font-medium capitalize">
                  {selectedConversation.channel}
                </span>
              </div>
            </div>
          </div>

          {/* Verification Status */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Google Sheets Sync
              </span>
              {isVerified ? (
                <Badge variant="emerald">Verified</Badge>
              ) : (
                <Badge variant="amber">Pending</Badge>
              )}
            </div>
            <p className="text-[11px] text-slate-500 leading-normal">
              {isVerified
                ? 'Survey record verified in linked Google Spreadsheet.'
                : 'Awaiting survey submission from candidate.'}
            </p>
          </div>

          {/* Contact Tags */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" /> Tags
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {contact?.tags && contact.tags.length > 0 ? (
                contact.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-700"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-400">No tags assigned</span>
              )}
            </div>
          </div>

          {/* Custom Fields */}
          {contact?.customFields && Object.keys(contact.customFields).length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                Ingested Spreadsheet Fields
              </h4>
              <div className="space-y-1.5 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                {Object.entries(contact.customFields).map(([key, val]) => (
                  <div key={key} className="flex justify-between py-0.5">
                    <span className="text-slate-500 capitalize">{key}:</span>
                    <span className="font-medium text-slate-900">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
