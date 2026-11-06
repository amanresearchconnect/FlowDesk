import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  nodeTypes,
  WorkflowNodeData
} from './nodes/WorkflowCustomNodes';
import {
  Plus,
  Save,
  Play,
  RotateCcw,
  Trash2,
  X,
  MessageSquare,
  GitBranch,
  Tag,
  FileSpreadsheet,
  Bot,
  UserCheck,
  XCircle,
  HelpCircle,
  Sparkles,
  CheckCircle2,
  Send
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';

interface WorkflowCanvasProps {
  workflow: any;
  onSave: (updatedNodes: any[]) => Promise<void>;
  onTriggerTest: () => void;
  isSaving?: boolean;
}

// Convert FlowDesk linear / branched nodes into React Flow layout nodes & edges
const convertWorkflowToGraph = (nodes: any[] = []): { nodes: Node[]; edges: Edge[] } => {
  const rfNodes: Node[] = [];
  const rfEdges: Edge[] = [];

  const startX = 250;
  const startY = 40;
  const verticalSpacing = 160;

  nodes.forEach((node, idx) => {
    // If node already has stored position, use it; otherwise compute staggered tree layout
    let x = startX;
    let y = startY + idx * verticalSpacing;

    if (node.config?._position) {
      x = node.config._position.x;
      y = node.config._position.y;
    } else {
      // Offset branches horizontally
      if (node.id.includes('yes') || node.id.includes('qualified') || node.id.includes('survey')) {
        x = startX - 180;
      } else if (node.id.includes('no') || node.id.includes('opt_out') || node.id.includes('declined')) {
        x = startX + 180;
      }
    }

    rfNodes.push({
      id: node.id,
      type: node.type || 'send_message',
      position: { x, y },
      data: {
        ...node,
        name: node.name,
        type: node.type,
        config: node.config || {},
        branches: node.branches || []
      }
    });

    // 1. Direct nextStepId edge
    if (node.nextStepId) {
      rfEdges.push({
        id: `e-${node.id}-${node.nextStepId}`,
        source: node.id,
        target: node.nextStepId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#64748b', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' }
      });
    }

    // 2. Branch edges (YES / NO / Default)
    if (node.branches && node.branches.length > 0) {
      node.branches.forEach((branch: any, bIdx: number) => {
        const val = branch.conditionValue?.toLowerCase() || '';
        const isYes = val === 'yes' || val.includes('yes');
        const isNo = val === 'no' || val.includes('no');

        let strokeColor = '#f59e0b';
        let sourceHandle: string | undefined = undefined;
        let label = branch.conditionValue || 'Condition';

        if (isYes) {
          strokeColor = '#059669';
          sourceHandle = 'yes';
          label = 'YES (Button)';
        } else if (isNo) {
          strokeColor = '#e11d48';
          sourceHandle = 'no';
          label = 'NO (Button)';
        }

        rfEdges.push({
          id: `e-branch-${node.id}-${branch.targetStepId}-${bIdx}`,
          source: node.id,
          sourceHandle,
          target: branch.targetStepId,
          type: 'smoothstep',
          animated: true,
          label,
          labelStyle: { fill: strokeColor, fontWeight: 700, fontSize: 10 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9, rx: 4, ry: 4 },
          style: { stroke: strokeColor, strokeWidth: 2.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor }
        });
      });
    }
  });

  return { nodes: rfNodes, edges: rfEdges };
};

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  workflow,
  onSave,
  onTriggerTest,
  isSaving = false
}) => {
  const initialGraph = useMemo(() => {
    return convertWorkflowToGraph(workflow?.nodes || workflow?.steps || []);
  }, [workflow]);

  const [nodes, setNodes] = useState<Node[]>(initialGraph.nodes);
  const [edges, setEdges] = useState<Edge[]>(initialGraph.edges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync if external workflow changes
  useEffect(() => {
    const graph = convertWorkflowToGraph(workflow?.nodes || workflow?.steps || []);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setSelectedNode(null);
  }, [workflow]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const removedIds = changes
        .filter((c) => c.type === 'remove')
        .map((c: any) => c.id);
      if (removedIds.length > 0) {
        setEdges((eds) => eds.filter((e) => !removedIds.includes(e.source) && !removedIds.includes(e.target)));
        setSelectedNode((curr) => (curr && removedIds.includes(curr.id) ? null : curr));
      }
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#059669', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#059669' }
          },
          eds
        )
      );
    },
    []
  );

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  };

  const handleUpdateSelectedNode = (updatedData: Partial<WorkflowNodeData>) => {
    if (!selectedNode) return;

    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          const merged = {
            ...n,
            data: {
              ...n.data,
              ...updatedData
            }
          };
          setSelectedNode(merged);
          return merged;
        }
        return n;
      })
    );
  };

  const handleDeleteSelectedNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  const handleAddNode = (type: string, name: string) => {
    const id = `step_${type}_${Date.now().toString(36).substring(3, 7)}`;
    const baseConfig: Record<string, any> = {};

    if (type === 'send_message') {
      baseConfig.messageTemplate = 'Hi {{firstName}}, are you interested in this position?';
      baseConfig.buttons = [
        { id: 'btn_yes', title: 'YES' },
        { id: 'btn_no', title: 'NO' }
      ];
    } else if (type === 'send_text_message') {
      type = 'send_message';
      baseConfig.messageTemplate = 'Thank you for your time, {{firstName}}! We have noted your response and will be in touch shortly.';
      baseConfig.buttons = [];
    } else if (type === 'condition') {
      baseConfig.variablePath = 'lastReply';
    } else if (type === 'update_record') {
      baseConfig.operations = [{ action: 'add_tag', value: 'interested' }];
    } else if (type === 'append_to_sheet') {
      baseConfig.sheetName = 'Responses';
      baseConfig.integrationType = 'google_sheets';
    }

    const newNode: Node = {
      id,
      type,
      position: { x: 260, y: (nodes.length + 1) * 140 },
      data: {
        id,
        name,
        type,
        config: baseConfig,
        branches:
          type === 'condition'
            ? [
                { conditionType: 'equals', conditionValue: 'YES', targetStepId: '' },
                { conditionType: 'equals', conditionValue: 'NO', targetStepId: '' }
              ]
            : []
      }
    };

    setNodes((nds) => [...nds, newNode]);
    setSelectedNode(newNode);
  };

  const handleSaveGraph = async () => {
    // Reconstruct backend workflow nodes from React Flow state
    const reconstructedNodes = nodes.map((node) => {
      const outgoingEdges = edges.filter((e) => e.source === node.id);

      let nextStepId: string | null = null;
      const branches: any[] = [];

      outgoingEdges.forEach((edge) => {
        const configuredYes = (node.data as any).config?.yesValue || 'YES, Interested, Apply, Sure';
        const configuredNo = (node.data as any).config?.noValue || 'NO, Not Interested, Decline';

        if (edge.sourceHandle === 'yes') {
          branches.push({
            conditionType: 'equals',
            conditionValue: configuredYes,
            targetStepId: edge.target
          });
        } else if (edge.sourceHandle === 'no') {
          branches.push({
            conditionType: 'equals',
            conditionValue: configuredNo,
            targetStepId: edge.target
          });
        } else if (edge.label && typeof edge.label === 'string') {
          branches.push({
            conditionType: 'equals',
            conditionValue: edge.label.replace(' (Button)', ''),
            targetStepId: edge.target
          });
        } else {
          nextStepId = edge.target;
        }
      });

      // Filter out any branches that do not have a target
      const dataBranches = ((node.data as any).branches || []).filter((b: any) => b && b.targetStepId);
      const finalBranches = branches.length > 0 ? branches : dataBranches;

      return {
        id: node.id,
        name: (node.data as any).name || 'Step',
        type: (node.data as any).type || node.type,
        config: {
          ...((node.data as any).config || {}),
          _position: node.position
        },
        nextStepId: nextStepId || (node.data as any).nextStepId || null,
        branches: finalBranches
      };
    });

    try {
      await onSave(reconstructedNodes);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to save workflow graph:', err);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 flex-1 bg-slate-900/5 rounded-2xl border border-slate-200 overflow-hidden relative shadow-xs">
      {/* Canvas Top Bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 z-10">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            Visual Workflow Designer
          </span>
          <Badge variant="slate" className="text-xs">
            {nodes.length} nodes · {edges.length} connections
          </Badge>
          {saveSuccess && (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 animate-fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved & Deployed!
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {selectedNode && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteSelectedNode}
              className="flex items-center gap-1.5 text-xs text-rose-700 border-rose-300 hover:bg-rose-50 hover:border-rose-400 font-semibold"
              title="Delete selected node (or press Backspace / Delete)"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Delete Node</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onTriggerTest}
            className="flex items-center gap-1.5 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
          >
            <Play className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" />
            Test Live on Mobile
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveGraph}
            disabled={isSaving}
            className="flex items-center gap-1.5 text-xs bg-slate-900 hover:bg-slate-800"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'Saving...' : 'Save Workflow'}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex relative min-h-0 overflow-hidden w-full">
        {/* Left Toolbar / Node Palette */}
        <div className="w-56 bg-slate-50 border-r border-slate-200 p-3 z-10 space-y-3 overflow-y-auto">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Add Workflow Node
          </span>

          <div className="space-y-1.5">
            <button
              onClick={() => handleAddNode('send_message', 'WhatsApp Interactive Message')}
              className="w-full text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-400 hover:shadow-xs transition-all flex items-center gap-2 text-xs font-semibold text-slate-800 group"
            >
              <div className="p-1 rounded bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <MessageSquare className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block truncate">Interactive Message</span>
                <span className="text-[10px] text-slate-500 font-normal">With YES/NO buttons</span>
              </div>
            </button>

            <button
              onClick={() => handleAddNode('send_text_message', 'Thank You / Text Reply')}
              className="w-full text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-sky-400 hover:shadow-xs transition-all flex items-center gap-2 text-xs font-semibold text-slate-800 group"
            >
              <div className="p-1 rounded bg-sky-100 text-sky-700 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                <Send className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block truncate">Normal Reply (No Buttons)</span>
                <span className="text-[10px] text-slate-500 font-normal">e.g. "Thank you for your time"</span>
              </div>
            </button>

            <button
              onClick={() => handleAddNode('condition', 'Branch on Candidate Reply')}
              className="w-full text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-amber-400 hover:shadow-xs transition-all flex items-center gap-2 text-xs font-semibold text-slate-800 group"
            >
              <div className="p-1 rounded bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <GitBranch className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block truncate">Decision Branch</span>
                <span className="text-[10px] text-slate-500 font-normal">YES / NO Sockets</span>
              </div>
            </button>

            <button
              onClick={() => handleAddNode('update_record', 'Tag Contact (Interested)')}
              className="w-full text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-blue-400 hover:shadow-xs transition-all flex items-center gap-2 text-xs font-semibold text-slate-800 group"
            >
              <div className="p-1 rounded bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Tag className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block truncate">Update Record</span>
                <span className="text-[10px] text-slate-500 font-normal">Add Tags & Fields</span>
              </div>
            </button>

            <button
              onClick={() => handleAddNode('verify_data', 'Verify Candidate Survey')}
              className="w-full text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-teal-400 hover:shadow-xs transition-all flex items-center gap-2 text-xs font-semibold text-slate-800 group"
            >
              <div className="p-1 rounded bg-teal-100 text-teal-700 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block truncate">Verify Survey</span>
                <span className="text-[10px] text-slate-500 font-normal">Google Sheets match</span>
              </div>
            </button>

            <button
              onClick={() => handleAddNode('append_to_sheet', 'Append to Excel / Sheets')}
              className="w-full text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-emerald-500 hover:shadow-xs transition-all flex items-center gap-2 text-xs font-semibold text-slate-800 group"
            >
              <div className="p-1 rounded bg-emerald-100 text-emerald-800 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block truncate">Excel / Sheet Write</span>
                <span className="text-[10px] text-slate-500 font-normal">Append Candidate Row</span>
              </div>
            </button>

            <button
              onClick={() => handleAddNode('ai_conversation', 'AI Grounded Bot')}
              className="w-full text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-xs transition-all flex items-center gap-2 text-xs font-semibold text-slate-800 group"
            >
              <div className="p-1 rounded bg-indigo-100 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block truncate">AI Assistant</span>
                <span className="text-[10px] text-slate-500 font-normal">Knowledge Base Q&A</span>
              </div>
            </button>

            <button
              onClick={() => handleAddNode('human_handoff', 'Escalate to Team Inbox')}
              className="w-full text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-amber-400 hover:shadow-xs transition-all flex items-center gap-2 text-xs font-semibold text-slate-800 group"
            >
              <div className="p-1 rounded bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <UserCheck className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block truncate">Human Handoff</span>
                <span className="text-[10px] text-slate-500 font-normal">Team Inbox Alert</span>
              </div>
            </button>

            <button
              onClick={() => handleAddNode('terminate', 'Opt-Out / Completed')}
              className="w-full text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-400 hover:shadow-xs transition-all flex items-center gap-2 text-xs font-semibold text-slate-800 group"
            >
              <div className="p-1 rounded bg-slate-200 text-slate-700 group-hover:bg-slate-600 group-hover:text-white transition-colors">
                <XCircle className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block truncate">End Flow</span>
                <span className="text-[10px] text-slate-500 font-normal">Mark Finished</span>
              </div>
            </button>
          </div>

          <div className="pt-4 border-t border-slate-200 text-[10px] text-slate-500 space-y-1">
            <p><strong>Tip:</strong> Drag from the bottom socket of any node into another node's top socket to connect.</p>
            <p>Click any node to customize its message, buttons, or rules.</p>
          </div>
        </div>

        {/* Main Canvas Workspace */}
        <div className="flex-1 h-full bg-slate-50/50">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={1.5}
          >
            <Background color="#cbd5e1" gap={18} size={1} />
            <Controls className="!bg-white !border-slate-200 !shadow-sm !rounded-lg" />
            <MiniMap
              className="!bg-white !border-slate-200 !shadow-sm !rounded-lg"
              nodeColor={(n) => {
                if (n.type === 'send_message') return '#10b981';
                if (n.type === 'condition') return '#f59e0b';
                if (n.type === 'trigger') return '#8b5cf6';
                return '#94a3b8';
              }}
            />
          </ReactFlow>
        </div>

        {/* Right Drawer: Node Inspector / Properties Editor */}
        {selectedNode && (
          <div className="w-80 md:w-96 shrink-0 bg-white border-l border-slate-200 z-20 flex flex-col h-full shadow-2xl animate-fade-in min-h-0 overflow-hidden">
            {/* Drawer Header */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Node Inspector
                </span>
                <h3 className="text-sm font-bold text-slate-900 truncate max-w-[210px]">
                  {(selectedNode.data as any).name || selectedNode.id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Close Inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Drawer Body with Guaranteed Scrollbar */}
            <div
              className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 overscroll-contain focus:outline-none [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-400"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 #f1f5f9' }}
            >
              {/* Step Name */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Step Title</label>
                <input
                  type="text"
                  value={(selectedNode.data as any).name || ''}
                  onChange={(e) => handleUpdateSelectedNode({ name: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                />
              </div>

              {/* 1. WhatsApp Message Node (Interactive Buttons & Normal Reply) */}
              {selectedNode.type === 'send_message' && (
                <div className="space-y-3.5 pt-1">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Message Body</label>
                    <textarea
                      rows={3}
                      value={(selectedNode.data as any).config?.messageTemplate || (selectedNode.data as any).config?.body || ''}
                      onChange={(e) => {
                        const newConfig = {
                          ...(selectedNode.data as any).config,
                          messageTemplate: e.target.value
                        };
                        handleUpdateSelectedNode({ config: newConfig });
                      }}
                      placeholder="Hi {{firstName}}, are you interested in this position?"
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                    <span className="text-[10px] text-slate-400 block">
                      Supports tags: {'{{firstName}}'}, {'{{company}}'}, {'{{role}}'}
                    </span>
                  </div>

                  {/* Interactive Quick-Reply Buttons Configuration */}
                  <div className="space-y-2.5 pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                        Quick-Reply Buttons ({((selectedNode.data as any).config?.buttons || []).length}/3)
                      </label>
                      {((selectedNode.data as any).config?.buttons || []).length < 3 && (
                        <button
                          type="button"
                          onClick={() => {
                            const currentButtons = (selectedNode.data as any).config?.buttons || [];
                            const newBtn = {
                              id: `btn_${currentButtons.length + 1}`,
                              title: currentButtons.length === 0 ? 'Interested' : 'Not Interested'
                            };
                            const newConfig = {
                              ...(selectedNode.data as any).config,
                              buttons: [...currentButtons, newBtn]
                            };
                            handleUpdateSelectedNode({ config: newConfig });
                          }}
                          className="px-2 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md transition-colors flex items-center gap-1 shadow-2xs"
                        >
                          <Plus className="w-3 h-3" /> Add Button
                        </button>
                      )}
                    </div>

                    {((selectedNode.data as any).config?.buttons || []).length === 0 ? (
                      <div className="p-3 rounded-lg bg-sky-50/80 border border-sky-200 text-[11px] text-sky-950 space-y-2">
                        <div className="flex items-center gap-1.5 font-bold">
                          <Send className="w-3.5 h-3.5 text-sky-600" />
                          Normal Text Reply (No Buttons)
                        </div>
                        <p className="text-[10px] text-slate-600 leading-relaxed">
                          This step sends a standard WhatsApp text reply (e.g. <em>"Thank you for your time"</em>) without quick-reply buttons.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            const newConfig = {
                              ...(selectedNode.data as any).config,
                              buttons: [
                                { id: 'btn_1', title: 'Interested' },
                                { id: 'btn_2', title: 'Not Interested' }
                              ]
                            };
                            handleUpdateSelectedNode({ config: newConfig });
                          }}
                          className="w-full py-1.5 px-2 bg-white hover:bg-sky-100 text-sky-800 font-bold rounded border border-sky-300 text-xs transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Interactive Buttons
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {((selectedNode.data as any).config?.buttons || []).map((btn: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50/70 border border-emerald-200"
                          >
                            <div className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                            <input
                              type="text"
                              maxLength={20}
                              value={btn.title}
                              onChange={(e) => {
                                const currentButtons = [...((selectedNode.data as any).config?.buttons || [])];
                                currentButtons[idx] = { ...currentButtons[idx], title: e.target.value };
                                handleUpdateSelectedNode({
                                  config: { ...(selectedNode.data as any).config, buttons: currentButtons }
                                });
                              }}
                              placeholder={`Button ${idx + 1} (e.g. Interested)`}
                              className="flex-1 px-2.5 py-1 text-xs bg-white border border-emerald-300 rounded text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                            <span className="text-[9px] font-mono text-slate-400 shrink-0">{btn.title.length}/20</span>
                            <button
                              type="button"
                              onClick={() => {
                                const filtered = ((selectedNode.data as any).config?.buttons || []).filter(
                                  (_: any, bIdx: number) => bIdx !== idx
                                );
                                handleUpdateSelectedNode({
                                  config: { ...(selectedNode.data as any).config, buttons: filtered }
                                });
                              }}
                              className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition-colors"
                              title="Delete button"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        <p className="text-[10px] text-slate-500 italic">
                          Candidates tap these buttons in WhatsApp. Up to 3 quick-reply options supported.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 2. Condition / Decision Branch Node (Fully Configurable for ANY Button Text) */}
              {selectedNode.type === 'condition' && (
                <div className="space-y-3 pt-1 text-xs">
                  {/* Auto-Sync from Connected Message Step */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Branch Routing Rules
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        // Find incoming edge from a message node
                        const incomingEdge = edges.find((e) => e.target === selectedNode.id);
                        if (incomingEdge) {
                          const prevNode = nodes.find((n) => n.id === incomingEdge.source);
                          const prevButtons: Array<{ id: string; title: string }> =
                            (prevNode?.data as any)?.config?.buttons || [];
                          if (prevButtons.length >= 2) {
                            handleUpdateSelectedNode({
                              config: {
                                ...(selectedNode.data as any).config,
                                yesValue: prevButtons[0].title,
                                noValue: prevButtons[1].title
                              }
                            });
                          } else if (prevButtons.length === 1) {
                            handleUpdateSelectedNode({
                              config: {
                                ...(selectedNode.data as any).config,
                                yesValue: prevButtons[0].title
                              }
                            });
                          }
                        }
                      }}
                      className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded transition-colors"
                      title="Sync button titles from the preceding message node"
                    >
                      ⚡ Auto-Sync Buttons
                    </button>
                  </div>

                  {/* Branch 1 (Left Socket) Value Configuration */}
                  <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-600" />
                        Branch 1 (Left Socket)
                      </span>
                      <span className="text-[10px] font-bold bg-emerald-200/70 text-emerald-800 px-1.5 py-0.5 rounded">
                        YES / Positive
                      </span>
                    </div>
                    <p className="text-[10px] text-emerald-800/90">
                      Matches when candidate taps button or replies with:
                    </p>
                    <input
                      type="text"
                      value={(selectedNode.data as any).config?.yesValue ?? 'YES, Interested, Apply, Sure'}
                      onChange={(e) => {
                        handleUpdateSelectedNode({
                          config: {
                            ...(selectedNode.data as any).config,
                            yesValue: e.target.value
                          }
                        });
                      }}
                      placeholder="e.g. Interested, YES, Confirm"
                      className="w-full px-2.5 py-1 text-xs bg-white border border-emerald-300 rounded font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="text-[9px] text-emerald-700 block">
                      Tip: Comma-separated synonyms supported (e.g. <em>Interested, YES, Confirm</em>).
                    </span>
                  </div>

                  {/* Branch 2 (Right Socket) Value Configuration */}
                  <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-950 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-600" />
                        Branch 2 (Right Socket)
                      </span>
                      <span className="text-[10px] font-bold bg-rose-200/70 text-rose-800 px-1.5 py-0.5 rounded">
                        NO / Negative
                      </span>
                    </div>
                    <p className="text-[10px] text-rose-800/90">
                      Matches when candidate taps button or replies with:
                    </p>
                    <input
                      type="text"
                      value={(selectedNode.data as any).config?.noValue ?? 'NO, Not Interested, Decline'}
                      onChange={(e) => {
                        handleUpdateSelectedNode({
                          config: {
                            ...(selectedNode.data as any).config,
                            noValue: e.target.value
                          }
                        });
                      }}
                      placeholder="e.g. Not Interested, NO, Decline"
                      className="w-full px-2.5 py-1 text-xs bg-white border border-rose-300 rounded font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                    <span className="text-[9px] text-rose-700 block">
                      Tip: Comma-separated synonyms supported (e.g. <em>Not Interested, NO, Decline</em>).
                    </span>
                  </div>

                  <div className="space-y-1 pt-1">
                    <label className="text-[11px] font-semibold text-slate-600">Evaluated Variable</label>
                    <input
                      type="text"
                      value={(selectedNode.data as any).config?.variablePath || 'lastReply'}
                      onChange={(e) => {
                        handleUpdateSelectedNode({
                          config: { ...(selectedNode.data as any).config, variablePath: e.target.value }
                        });
                      }}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono"
                    />
                  </div>
                </div>
              )}

              {/* 3. Excel / Google Sheets Verification Node */}
              {selectedNode.type === 'verify_data' && (
                <div className="space-y-3 pt-2 text-xs">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Integration Provider</label>
                    <select
                      value={(selectedNode.data as any).config?.provider || 'google_sheets'}
                      onChange={(e) => {
                        handleUpdateSelectedNode({
                          config: { ...(selectedNode.data as any).config, provider: e.target.value }
                        });
                      }}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900"
                    >
                      <option value="google_sheets">Google Sheets API v4</option>
                      <option value="microsoft_excel">Microsoft Excel Online (Graph API)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Sheet / Tab Name</label>
                    <input
                      type="text"
                      value={(selectedNode.data as any).config?.sheetName || 'Responses'}
                      onChange={(e) => {
                        handleUpdateSelectedNode({
                          config: { ...(selectedNode.data as any).config, sheetName: e.target.value }
                        });
                      }}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Match Field</label>
                    <input
                      type="text"
                      value={(selectedNode.data as any).config?.matchField || 'phone'}
                      onChange={(e) => {
                        handleUpdateSelectedNode({
                          config: { ...(selectedNode.data as any).config, matchField: e.target.value }
                        });
                      }}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-mono"
                    />
                  </div>
                  <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-[10px] text-teal-800 space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-teal-700" />
                      Two-Way Spreadsheet Reading
                    </p>
                    <p>Reads candidate responses by matching candidate phone or ID in your cloud spreadsheet.</p>
                  </div>
                </div>
              )}

              {/* 4. Append to Spreadsheet Node */}
              {selectedNode.type === 'append_to_sheet' && (
                <div className="space-y-3 pt-2 text-xs">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Integration Provider</label>
                    <select
                      value={(selectedNode.data as any).config?.integrationType || 'google_sheets'}
                      onChange={(e) => {
                        handleUpdateSelectedNode({
                          config: { ...(selectedNode.data as any).config, integrationType: e.target.value }
                        });
                      }}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900"
                    >
                      <option value="google_sheets">Google Sheets API v4</option>
                      <option value="microsoft_excel">Microsoft Excel Online (Graph API)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Sheet / Tab Name</label>
                    <input
                      type="text"
                      value={(selectedNode.data as any).config?.sheetName || 'Responses'}
                      onChange={(e) => {
                        handleUpdateSelectedNode({
                          config: { ...(selectedNode.data as any).config, sheetName: e.target.value }
                        });
                      }}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-mono"
                    />
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[10px] text-emerald-800 space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                      Live Spreadsheet Writing
                    </p>
                    <p>Appends candidate row: [Name, Phone, Role, Status, Verified Timestamp].</p>
                  </div>
                </div>
              )}

              {/* 5. Update Contact Record Node */}
              {selectedNode.type === 'update_record' && (
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-semibold text-slate-700">Add Tags to Contact</label>
                  <input
                    type="text"
                    placeholder="interested, screened, interview_ready"
                    value={
                      ((selectedNode.data as any).config?.operations || [])
                        .filter((op: any) => op.action === 'add_tag')
                        .map((op: any) => op.value)
                        .join(', ') || ''
                    }
                    onChange={(e) => {
                      const tags = e.target.value.split(',').map((t) => t.trim()).filter(Boolean);
                      const ops = tags.map((t) => ({ action: 'add_tag', value: t }));
                      handleUpdateSelectedNode({
                        config: { ...(selectedNode.data as any).config, operations: ops }
                      });
                    }}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-[10px] text-slate-400 block">Comma-separated tags (e.g. interested, screened)</span>
                </div>
              )}

              {/* 6. Inbound Trigger Node */}
              {selectedNode.type === 'trigger' && (
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-semibold text-slate-700">Trigger Keywords</label>
                  <input
                    type="text"
                    placeholder="APPLY, HI, JOB"
                    value={((selectedNode.data as any).config?.keywords || []).join(', ')}
                    onChange={(e) => {
                      const kw = e.target.value.split(',').map((k) => k.trim()).filter(Boolean);
                      handleUpdateSelectedNode({
                        config: { ...(selectedNode.data as any).config, keywords: kw }
                      });
                    }}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 block">Comma-separated incoming WhatsApp keywords</span>
                </div>
              )}

              {/* 7. End / Terminate Node */}
              {selectedNode.type === 'terminate' && (
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-semibold text-slate-700">Completion Reason</label>
                  <input
                    type="text"
                    placeholder="Screening completed"
                    value={(selectedNode.data as any).config?.reason || ''}
                    onChange={(e) => {
                      handleUpdateSelectedNode({
                        config: { ...(selectedNode.data as any).config, reason: e.target.value }
                      });
                    }}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  />
                </div>
              )}
            </div>

            {/* Drawer Pinned Footer with Guaranteed Visibility */}
            <div className="shrink-0 p-3 bg-slate-50 border-t border-slate-200 space-y-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteSelectedNode}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300 font-semibold py-2 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Node
              </Button>
              <p className="text-[10px] text-center text-slate-400">
                Changes apply instantly · Click <strong>Save Workflow</strong> above to persist.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

