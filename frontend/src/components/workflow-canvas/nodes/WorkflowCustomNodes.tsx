import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Zap,
  MessageSquare,
  GitBranch,
  Tag,
  FileSpreadsheet,
  UserCheck,
  XCircle,
  HelpCircle,
  Bot,
  Send,
  Sparkles,
  Clock
} from 'lucide-react';

export interface WorkflowNodeData {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  nextStepId?: string;
  branches?: Array<{
    conditionType: string;
    conditionValue?: string | null;
    targetStepId: string;
  }>;
  onSelectNode?: (data: WorkflowNodeData) => void;
  [key: string]: any;
}

// 1. Trigger Node
export const TriggerNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as WorkflowNodeData;
  return (
    <div
      className={`min-w-[240px] max-w-[280px] rounded-xl bg-white border-2 shadow-sm transition-all text-slate-800 ${
        selected ? 'border-purple-600 shadow-md ring-2 ring-purple-500/20' : 'border-purple-200 hover:border-purple-300'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-purple-50/80 rounded-t-xl border-b border-purple-100">
        <div className="p-1.5 rounded-lg bg-purple-600 text-white">
          <Zap className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-purple-700">Trigger</span>
          <h4 className="text-xs font-semibold text-slate-900 truncate">{nodeData.name || 'Start Trigger'}</h4>
        </div>
      </div>
      <div className="p-3 text-[11px] text-slate-600 space-y-1">
        <p className="line-clamp-2">
          {nodeData.config?.keywords?.length
            ? `Keywords: ${nodeData.config.keywords.join(', ')}`
            : 'Outreach campaign broadcast or inbound message trigger.'}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-purple-600 !border-2 !border-white"
      />
    </div>
  );
};

// 2. WhatsApp Message Node (With Interactive Buttons YES/NO preview)
export const MessageNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const buttons: Array<{ id: string; title: string }> = nodeData.config?.buttons || [];
  const messageText = nodeData.config?.messageTemplate || nodeData.config?.body || 'Hello {{firstName}}!';

  return (
    <div
      className={`min-w-[260px] max-w-[300px] rounded-xl bg-white border-2 shadow-sm transition-all text-slate-800 ${
        selected ? 'border-emerald-600 shadow-md ring-2 ring-emerald-500/20' : 'border-emerald-200 hover:border-emerald-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-emerald-600 !border-2 !border-white"
      />
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50/80 rounded-t-xl border-b border-emerald-100">
        <div className="p-1.5 rounded-lg bg-emerald-600 text-white">
          <MessageSquare className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-700">WhatsApp Message</span>
          <h4 className="text-xs font-semibold text-slate-900 truncate">{nodeData.name || 'Send Message'}</h4>
        </div>
        {nodeData.config?.templateName ? (
          <span className="px-1.5 py-0.5 text-[9px] font-bold bg-sky-100 text-sky-800 rounded border border-sky-300">
            Meta Template
          </span>
        ) : buttons.length > 0 ? (
          <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-800 rounded">
            Interactive
          </span>
        ) : null}
      </div>

      <div className="p-3 space-y-2.5">
        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] text-slate-700 font-mono line-clamp-3">
          {messageText}
        </div>

        {/* Interactive Buttons Badges */}
        {buttons.length > 0 ? (
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Native WhatsApp Buttons:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {buttons.map((btn, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 text-[11px] font-bold rounded-md bg-emerald-100/90 text-emerald-900 border border-emerald-300 flex items-center gap-1 shadow-2xs"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                  {btn.title}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-semibold border border-slate-200">
            <div className="flex items-center gap-1.5">
              <Send className="w-3 h-3 text-sky-600" />
              <span>Normal Text Message</span>
            </div>
            {nodeData.config?.waitForReply && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold border border-amber-300">
                Waits for Reply
              </span>
            )}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-emerald-600 !border-2 !border-white"
      />
    </div>
  );
};

// 3. Decision Branch Node (Dual Handles: YES/Positive on left, NO/Negative on right)
export const DecisionNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const branches = nodeData.branches || [];
  const yesBranch = branches.find((b) => b.conditionValue?.toLowerCase().includes('yes')) || branches[0];
  const noBranch = branches.find((b) => b.conditionValue?.toLowerCase().includes('no')) || branches[1];

  const yesLabel = nodeData.config?.yesValue
    ? nodeData.config.yesValue.split(',')[0].trim()
    : (yesBranch?.conditionValue ? yesBranch.conditionValue.split(',')[0].trim() : 'YES / Interested');
  const noLabel = nodeData.config?.noValue
    ? nodeData.config.noValue.split(',')[0].trim()
    : (noBranch?.conditionValue ? noBranch.conditionValue.split(',')[0].trim() : 'NO / Declined');

  return (
    <div
      className={`min-w-[260px] max-w-[300px] rounded-xl bg-white border-2 shadow-sm transition-all text-slate-800 ${
        selected ? 'border-amber-500 shadow-md ring-2 ring-amber-500/20' : 'border-amber-200 hover:border-amber-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-amber-500 !border-2 !border-white"
      />

      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50/80 rounded-t-xl border-b border-amber-100">
        <div className="p-1.5 rounded-lg bg-amber-500 text-white">
          <GitBranch className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-amber-700">Decision Branch</span>
          <h4 className="text-xs font-semibold text-slate-900 truncate">{nodeData.name || 'Branch on Reply'}</h4>
        </div>
      </div>

      <div className="p-3 text-[11px] text-slate-600 space-y-2">
        <p className="text-[11px] text-slate-600 font-medium">
          Route candidate based on interactive button tap or message:
        </p>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
            <span className="text-xs font-bold text-emerald-800 truncate block" title={yesLabel}>
              {yesLabel}
            </span>
            <span className="text-[10px] text-emerald-600/80 truncate block">
              {yesBranch?.targetStepId || 'Target Step'}
            </span>
          </div>
          <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-center">
            <span className="text-xs font-bold text-rose-800 truncate block" title={noLabel}>
              {noLabel}
            </span>
            <span className="text-[10px] text-rose-600/80 truncate block">
              {noBranch?.targetStepId || 'Target Step'}
            </span>
          </div>
        </div>
      </div>

      {/* Sockets for branching with dynamic labels */}
      <div className="relative h-6 bg-slate-50 rounded-b-xl border-t border-slate-100 flex items-center justify-between px-4 text-[10px] font-bold">
        <span className="text-emerald-700 truncate max-w-[110px]">{yesLabel} Socket</span>
        <span className="text-rose-700 truncate max-w-[110px]">{noLabel} Socket</span>
      </div>

      {/* YES Socket Handle (Left) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{ left: '25%' }}
        className="w-3.5 h-3.5 !bg-emerald-600 !border-2 !border-white"
      />
      {/* NO Socket Handle (Right) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{ left: '75%' }}
        className="w-3.5 h-3.5 !bg-rose-500 !border-2 !border-white"
      />
    </div>
  );
};

// 4. Update Record / Tag Node
export const ActionNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const operations = nodeData.config?.operations || [];
  const tagsToAdd = operations
    .filter((op: any) => op.action === 'add_tag')
    .map((op: any) => op.value);

  return (
    <div
      className={`min-w-[240px] max-w-[280px] rounded-xl bg-white border-2 shadow-sm transition-all text-slate-800 ${
        selected ? 'border-blue-600 shadow-md ring-2 ring-blue-500/20' : 'border-blue-200 hover:border-blue-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-blue-600 !border-2 !border-white"
      />
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50/80 rounded-t-xl border-b border-blue-100">
        <div className="p-1.5 rounded-lg bg-blue-600 text-white">
          <Tag className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-blue-700">Update Record</span>
          <h4 className="text-xs font-semibold text-slate-900 truncate">{nodeData.name || 'Tag Contact'}</h4>
        </div>
      </div>
      <div className="p-3 text-[11px] text-slate-600 space-y-2">
        {tagsToAdd.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tagsToAdd.map((tag: string, idx: number) => (
              <span key={idx} className="px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-800 rounded">
                +{tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 italic">No tag operations configured.</p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-blue-600 !border-2 !border-white"
      />
    </div>
  );
};

// 5. Verify Form / Sheet Node
export const VerifyNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const isAppend = nodeData.type === 'append_to_sheet';
  const colorClass = isAppend ? 'emerald' : 'teal';

  return (
    <div
      className={`min-w-[250px] max-w-[290px] rounded-xl bg-white border-2 shadow-sm transition-all text-slate-800 ${
        selected
          ? isAppend
            ? 'border-emerald-600 shadow-md ring-2 ring-emerald-500/20'
            : 'border-teal-600 shadow-md ring-2 ring-teal-500/20'
          : isAppend
          ? 'border-emerald-200 hover:border-emerald-300'
          : 'border-teal-200 hover:border-teal-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className={`w-3 h-3 !border-2 !border-white ${isAppend ? '!bg-emerald-600' : '!bg-teal-600'}`}
      />
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border-b ${
          isAppend ? 'bg-emerald-50/80 border-emerald-100' : 'bg-teal-50/80 border-teal-100'
        }`}
      >
        <div className={`p-1.5 rounded-lg text-white ${isAppend ? 'bg-emerald-600' : 'bg-teal-600'}`}>
          <FileSpreadsheet className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span
            className={`text-[10px] uppercase font-bold tracking-wider ${
              isAppend ? 'text-emerald-700' : 'text-teal-700'
            }`}
          >
            {isAppend ? 'Write / Append Sheet' : 'Read / Verify Sheet'}
          </span>
          <h4 className="text-xs font-semibold text-slate-900 truncate">
            {nodeData.name || (isAppend ? 'Append to Spreadsheet' : 'Verify Survey')}
          </h4>
        </div>
      </div>
      <div className="p-3 text-[11px] text-slate-600 space-y-1">
        <p>
          Target Tab: <strong className="text-slate-800 font-mono">{nodeData.config?.sheetName || 'Responses'}</strong>
        </p>
        {nodeData.config?.spreadsheetUrl ? (
          <p className="text-[10px] text-emerald-700 font-mono truncate" title={nodeData.config.spreadsheetUrl}>
            🔗 {nodeData.config.spreadsheetUrl.replace(/https?:\/\//, '').substring(0, 28)}...
          </p>
        ) : (
          <p className="text-[10px] text-slate-400">Sheet: System Default / Mock</p>
        )}
        {isAppend && nodeData.config?.waitForReply && (
          <div className="pt-1">
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold border border-amber-300 inline-flex items-center gap-1">
              ⏳ Waits for reply
            </span>
          </div>
        )}
      </div>

      {isAppend ? (
        <Handle
          type="source"
          position={Position.Bottom}
          className="w-3 h-3 !border-2 !border-white !bg-emerald-600"
        />
      ) : (
        <>
          {/* Visual Branch Indicators for Verify Node */}
          <div className="relative h-6 bg-slate-50 rounded-b-xl border-t border-slate-100 flex items-center justify-between px-3 text-[10px] font-bold select-none">
            <span className="text-emerald-700 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Found (True)
            </span>
            <span className="text-rose-700 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Not Found (False)
            </span>
          </div>

          {/* Found Socket (Left) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="yes"
            style={{ left: '25%' }}
            className="w-3.5 h-3.5 !bg-emerald-600 !border-2 !border-white"
          />
          {/* Not Found Socket (Right) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="no"
            style={{ left: '75%' }}
            className="w-3.5 h-3.5 !bg-rose-500 !border-2 !border-white"
          />
        </>
      )}
    </div>
  );
};

// 6. AI Agent Conversation Node
export const AINode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as WorkflowNodeData;
  return (
    <div
      className={`min-w-[240px] max-w-[280px] rounded-xl bg-white border-2 shadow-sm transition-all text-slate-800 ${
        selected ? 'border-indigo-600 shadow-md ring-2 ring-indigo-500/20' : 'border-indigo-200 hover:border-indigo-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-indigo-600 !border-2 !border-white"
      />
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50/80 rounded-t-xl border-b border-indigo-100">
        <div className="p-1.5 rounded-lg bg-indigo-600 text-white">
          <Bot className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-700">AI Autonomous Bot</span>
          <h4 className="text-xs font-semibold text-slate-900 truncate">{nodeData.name || 'AI Assistant'}</h4>
        </div>
      </div>
      <div className="p-3 text-[11px] text-slate-600 space-y-1">
        <p className="line-clamp-2">{nodeData.config?.prompt || 'Answer candidate questions grounded in Knowledge Base.'}</p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-indigo-600 !border-2 !border-white"
      />
    </div>
  );
};

// 7. Human Handoff Node
export const HandoffNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as WorkflowNodeData;
  return (
    <div
      className={`min-w-[220px] max-w-[260px] rounded-xl bg-white border-2 shadow-sm transition-all text-slate-800 ${
        selected ? 'border-amber-600 shadow-md ring-2 ring-amber-500/20' : 'border-amber-200 hover:border-amber-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-amber-600 !border-2 !border-white"
      />
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50/80 rounded-t-xl border-b border-amber-100">
        <div className="p-1.5 rounded-lg bg-amber-600 text-white">
          <UserCheck className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-amber-700">Team Inbox Handoff</span>
          <h4 className="text-xs font-semibold text-slate-900 truncate">{nodeData.name || 'Escalate to Agent'}</h4>
        </div>
      </div>
      <div className="p-3 text-[11px] text-slate-600">
        <p>Changes status to human_needed and notifies assigned HR recruiters.</p>
      </div>
    </div>
  );
};

// 8. AI Entity & Form Extractor Node
export const AIParseNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const rawFields = nodeData.config?.fields;
  const fields: string[] = Array.isArray(rawFields)
    ? rawFields.map((f: any) => (typeof f === 'string' ? f : f.name))
    : typeof nodeData.config?.fieldsRaw === 'string'
    ? nodeData.config.fieldsRaw.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  return (
    <div
      className={`min-w-[260px] max-w-[300px] rounded-xl bg-white border-2 shadow-sm transition-all text-slate-800 ${
        selected ? 'border-violet-600 shadow-md ring-2 ring-violet-500/20' : 'border-violet-200 hover:border-violet-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-violet-600 !border-2 !border-white"
      />
      <div className="flex items-center gap-2 px-3 py-2 bg-violet-50/80 rounded-t-xl border-b border-violet-100">
        <div className="p-1.5 rounded-lg bg-violet-600 text-white">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-violet-700">AI Entity Extractor</span>
          <h4 className="text-xs font-semibold text-slate-900 truncate">{nodeData.name || 'AI Form / Entity Parser'}</h4>
        </div>
        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-violet-100 text-violet-800 rounded">
          {fields.length} {fields.length === 1 ? 'Field' : 'Fields'}
        </span>
      </div>
      <div className="p-3 text-[11px] text-slate-600 space-y-2">
        {fields.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {fields.map((field: string, idx: number) => (
              <span key={idx} className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-violet-100 text-violet-800 rounded border border-violet-200">
                +{`{{${field}}}`}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-slate-400 italic text-[10px]">No extraction fields configured.</p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-violet-600 !border-2 !border-white"
      />
    </div>
  );
};

// 9. Terminate Node
export const TerminateNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as WorkflowNodeData;
  return (
    <div
      className={`min-w-[200px] max-w-[240px] rounded-xl bg-white border-2 shadow-sm transition-all text-slate-800 ${
        selected ? 'border-slate-600 shadow-md ring-2 ring-slate-500/20' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-slate-500 !border-2 !border-white"
      />
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-t-xl border-b border-slate-200">
        <div className="p-1.5 rounded-lg bg-slate-600 text-white">
          <XCircle className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-600">Complete / Opt-Out</span>
          <h4 className="text-xs font-semibold text-slate-900 truncate">{nodeData.name || 'End Flow'}</h4>
        </div>
      </div>
      <div className="p-3 text-[11px] text-slate-500">
        <p>Execution successfully finishes.</p>
      </div>
    </div>
  );
};

// 10. Wait & Follow-Up Node
export const DelayNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as WorkflowNodeData;
  const delayValue = nodeData.config?.delayValue ?? nodeData.config?.duration ?? 12;
  const delayUnit = nodeData.config?.delayUnit || 'hours';
  const messageText = nodeData.config?.messageTemplate || nodeData.config?.body;
  const buttons: Array<{ id: string; title: string }> = nodeData.config?.buttons || [];

  return (
    <div
      className={`min-w-[260px] max-w-[300px] rounded-xl bg-white border-2 shadow-sm transition-all text-slate-800 ${
        selected ? 'border-amber-600 shadow-md ring-2 ring-amber-500/20' : 'border-amber-200 hover:border-amber-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-amber-600 !border-2 !border-white"
      />
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50/80 rounded-t-xl border-b border-amber-100">
        <div className="p-1.5 rounded-lg bg-amber-600 text-white">
          <Clock className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] uppercase font-bold tracking-wider text-amber-700">Wait & Follow-Up</span>
          <h4 className="text-xs font-semibold text-slate-900 truncate">{nodeData.name || 'Scheduled Reminder'}</h4>
        </div>
        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-900 rounded border border-amber-300">
          ⏳ {delayValue} {delayUnit}
        </span>
      </div>

      <div className="p-3 space-y-2">
        {messageText ? (
          <>
            <div className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] text-slate-700 font-mono line-clamp-2">
              {messageText}
            </div>
            {buttons.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {buttons.map((btn, idx) => (
                  <span
                    key={idx}
                    className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-900 border border-amber-200"
                  >
                    {btn.title}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-[11px] text-slate-500 italic">
            Pauses workflow for {delayValue} {delayUnit} before proceeding to next step.
          </p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-amber-600 !border-2 !border-white"
      />
    </div>
  );
};

export const nodeTypes = {
  trigger: TriggerNode,
  send_message: MessageNode,
  send_text_message: MessageNode,
  condition: DecisionNode,
  delay: DelayNode,
  update_record: ActionNode,
  verify_data: VerifyNode,
  append_to_sheet: VerifyNode,
  ai_conversation: AINode,
  ai_parse: AIParseNode,
  human_handoff: HandoffNode,
  terminate: TerminateNode
};

