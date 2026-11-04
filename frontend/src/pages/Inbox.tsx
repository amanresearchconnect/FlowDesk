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
  Sliders
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
  };
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: string;
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

  // 2. Fetch messages for active conversation
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

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
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

    socket.on('message:received', handleMessageReceived);
    socket.on('message:status', handleStatusUpdate);
    socket.on('conversation:escalated', handleEscalated);

    // Fallback polling every 4s to ensure real-time guarantee even across network blips
    const pollInterval = setInterval(() => {
      if (activeConvId) {
        fetchMessages(activeConvId);
        fetchConversations();
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
        <div className="flex-1 flex flex-col h-full bg-[#f0f2f5] min-w-0">
          {/* Thread Header */}
          <div className="h-16 px-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                {selectedConversation.contactId?.firstName?.charAt(0) || 'C'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    {`${selectedConversation.contactId?.firstName || ''} ${selectedConversation.contactId?.lastName || ''}`.trim() || 'Candidate'}
                  </h3>
                  <span className="text-xs text-slate-500 font-mono">
                    {selectedConversation.contactId?.phone}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[11px] text-slate-400">Status:</span>
                  {selectedConversation.status === 'human_needed' && (
                    <span className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Candidate Requested Assistance
                    </span>
                  )}
                  {selectedConversation.status === 'bot' && (
                    <span className="text-[11px] font-semibold text-indigo-600 flex items-center gap-1">
                      <Cpu className="w-3 h-3" />
                      AI Assistant Responding
                    </span>
                  )}
                  {selectedConversation.status === 'agent_assigned' && (
                    <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                      <UserCheck className="w-3 h-3" />
                      Assigned to {selectedConversation.assignedUserId?.name || 'Agent'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Agent Actions */}
            <div className="flex items-center gap-2">
              {selectedConversation.status !== 'agent_assigned' ? (
                <Button size="sm" variant="primary" onClick={handleTakeover}>
                  <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                  Take Over Chat
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={handleReleaseToBot}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Release to Bot
                </Button>
              )}

              <Button size="sm" variant="secondary" onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>

          {/* Messages Scrollable Canvas */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => {
              const isCandidate = msg.direction === 'inbound';
              const isBot = msg.senderType === 'ai';
              const isAgent = msg.senderType === 'agent';

              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex flex-col max-w-[70%]',
                    isCandidate ? 'mr-auto items-start' : 'ml-auto items-end'
                  )}
                >
                  <div
                    className={cn(
                      'px-3.5 py-2 rounded-xl text-xs leading-relaxed shadow-sm relative group',
                      isCandidate
                        ? 'bg-white text-slate-900 rounded-tl-none border border-slate-200/60'
                        : isBot
                        ? 'bg-indigo-50 text-indigo-950 border border-indigo-200/80 rounded-tr-none'
                        : 'bg-[#d9fdd3] text-slate-900 rounded-tr-none'
                    )}
                  >
                    {/* Sender Label */}
                    {!isCandidate && (
                      <div className="flex items-center gap-1 mb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        {isBot ? (
                          <span className="text-indigo-600 flex items-center gap-1">
                            <Cpu className="w-2.5 h-2.5" /> FlowDesk AI
                          </span>
                        ) : (
                          <span className="text-emerald-700">
                            {msg.senderUserId?.name || 'Agent'}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Message Body */}
                    <p className="whitespace-pre-wrap">{msg.content?.body}</p>

                    {/* Footer: Time & Status Ticks */}
                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400">
                      <span>{formatDate(msg.createdAt)}</span>
                      {!isCandidate && (
                        <span>
                          {msg.status === 'read' ? (
                            <span title="Read"><CheckCheck className="w-3 h-3 text-sky-500" /></span>
                          ) : msg.status === 'delivered' ? (
                            <span title="Delivered"><CheckCheck className="w-3 h-3 text-slate-400" /></span>
                          ) : (
                            <span title="Sent"><Check className="w-3 h-3 text-slate-400" /></span>
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

          {/* Quick Simulation Banner (for Instant Testing) */}
          <div className="px-4 py-2 bg-slate-200/70 border-t border-slate-300 flex items-center justify-between text-xs text-slate-600">
            <span className="font-semibold text-slate-700 flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-emerald-600" />
              Candidate Quick Simulator:
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleSimulateInbound('YES')}
                className="px-2 py-0.5 bg-white hover:bg-slate-50 rounded border border-slate-300 font-mono text-[11px]"
              >
                "YES"
              </button>
              <button
                onClick={() => handleSimulateInbound('What are the working hours?')}
                className="px-2 py-0.5 bg-white hover:bg-slate-50 rounded border border-slate-300 text-[11px]"
              >
                "Working Hours?"
              </button>
              <button
                onClick={() => handleSimulateInbound('My survey id is SURV-99001')}
                className="px-2 py-0.5 bg-white hover:bg-slate-50 rounded border border-slate-300 text-[11px]"
              >
                "Survey SURV-99001"
              </button>
              <button
                onClick={() => handleSimulateInbound('I need to speak to a human representative')}
                className="px-2 py-0.5 bg-white hover:bg-slate-50 rounded border border-slate-300 text-amber-700 text-[11px]"
              >
                "Need Human"
              </button>
            </div>
          </div>

          {/* Message Input Box */}
          <form
            onSubmit={handleSendReply}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
          >
            <input
              type="text"
              placeholder={
                selectedConversation.status === 'bot'
                  ? 'Type an agent message to take over automatically...'
                  : 'Type a WhatsApp message to candidate...'
              }
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="flex-1 h-10 px-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={!replyText.trim() || isSending}
              isLoading={isSending}
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
      {/* COLUMN 3: Candidate & Verification Context Sidebar           */}
      {/* ============================================================ */}
      {selectedConversation && (
        <div className="w-72 lg:w-80 bg-white border-l border-slate-200 h-full overflow-y-auto p-4 space-y-5 shrink-0 hidden xl:block">
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
