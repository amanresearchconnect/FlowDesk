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
  CheckCircle2
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
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
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
    } else if (type === 'condition') {
      baseConfig.variablePath = 'lastReply';
    } else if (type === 'update_record') {
      baseConfig.operations = [{ action: 'add_tag', value: 'interested' }];
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
        if (edge.sourceHandle === 'yes') {
          branches.push({
            conditionType: 'equals',
            conditionValue: 'YES',
            targetStepId: edge.target
          });
        } else if (edge.sourceHandle === 'no') {
          branches.push({
            conditionType: 'equals',
            conditionValue: 'NO',
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

      // If condition node has configured branches in node.data, preserve targets
      const dataBranches = (node.data as any).branches || [];
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

    await onSave(reconstructedNodes);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="flex flex-col h-[740px] bg-slate-900/5 rounded-2xl border border-slate-200 overflow-hidden relative shadow-xs">
      {/* Canvas Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 z-10">
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

      <div className="flex-1 flex relative">
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
                <span className="block truncate">WhatsApp Message</span>
                <span className="text-[10px] text-slate-500 font-normal">With YES/NO buttons</span>
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
          <div className="w-80 bg-white border-l border-slate-200 p-4 z-10 flex flex-col justify-between overflow-y-auto shadow-lg animate-fade-in">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Node Inspector
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    {(selectedNode.data as any).name || selectedNode.id}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Step Name */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Step Title</label>
                <input
                  type="text"
                  value={(selectedNode.data as any).name || ''}
                  onChange={(e) => handleUpdateSelectedNode({ name: e.target.value })}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Node-specific configuration */}
              {selectedNode.type === 'send_message' && (
                <div className="space-y-3 pt-2">
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
                    <span className="text-[10px] text-slate-400">
                      Supports tags: {'{{firstName}}'}, {'{{company}}'}, {'{{role}}'}
                    </span>
                  </div>

                  {/* Interactive Quick-Reply Buttons Configuration */}
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                        Quick-Reply Buttons (Max 3)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const currentButtons = (selectedNode.data as any).config?.buttons || [];
                          if (currentButtons.length >= 3) return;
                          const newBtn = {
                            id: `btn_${currentButtons.length + 1}`,
                            title: currentButtons.length === 0 ? 'YES' : 'NO'
                          };
                          const newConfig = {
                            ...(selectedNode.data as any).config,
                            buttons: [...currentButtons, newBtn]
                          };
                          handleUpdateSelectedNode({ config: newConfig });
                        }}
                        className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
                      >
                        + Add Button
                      </button>
                    </div>

                    {((selectedNode.data as any).config?.buttons || []).map((btn: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50/60 border border-emerald-200">
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
                          className="flex-1 px-2 py-1 text-xs bg-white border border-emerald-300 rounded text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <span className="text-[9px] text-slate-400">{btn.title.length}/20</span>
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
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedNode.type === 'condition' && (
                <div className="space-y-3 pt-2 text-xs">
                  <p className="text-slate-600">
                    This step evaluates candidate replies from interactive buttons or inbound text.
                  </p>
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
                    <span className="font-bold text-amber-900 block">Output Branch Sockets:</span>
                    <p className="text-[11px] text-amber-800">
                      • <strong>YES Socket (Left)</strong>: When user taps <em>YES</em>
                    </p>
                    <p className="text-[11px] text-amber-800">
                      • <strong>NO Socket (Right)</strong>: When user taps <em>NO</em>
                    </p>
                  </div>
                </div>
              )}

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
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteSelectedNode}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Node
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

