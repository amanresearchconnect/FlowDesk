import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  reconnectEdge,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  MarkerType,
  type EdgeProps
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
  Send,
  Clock,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { AIWorkflowGeneratorModal } from './AIWorkflowGeneratorModal';
import { cn } from '../../lib/utils';

interface WorkflowCanvasProps {
  workflow: any;
  onSave: (updatedNodes: any[]) => Promise<void>;
  onTriggerTest: () => void;
  isSaving?: boolean;
}

// Interactive edge with hover/click delete pill and selected state
export const RemovableEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
  label
}) => {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  const baseStroke = (style.stroke as string) || '#059669';

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: selected ? '#ef4444' : baseStroke,
          strokeWidth: selected ? 3.5 : (style.strokeWidth as number) || 2,
          transition: 'stroke 0.2s, stroke-width 0.2s'
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all'
          }}
          className="nodrag nopan flex items-center gap-1 z-20 group"
        >
          {label && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs select-none"
              style={{
                backgroundColor: '#ffffff',
                border: selected ? '1.5px solid #ef4444' : '1px solid #e2e8f0',
                color: selected ? '#ef4444' : baseStroke
              }}
            >
              {label}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('flowdesk:delete-edge', { detail: { id } }));
            }}
            title="Click to disconnect / delete connection"
            className={`w-5 h-5 rounded-full bg-white border flex items-center justify-center text-xs font-bold shadow-xs transition-all hover:scale-125 cursor-pointer ${
              selected
                ? 'border-rose-500 bg-rose-50 text-rose-600 scale-110 opacity-100'
                : 'border-slate-300 text-slate-400 hover:border-rose-500 hover:bg-rose-50 hover:text-rose-600 opacity-60 hover:opacity-100'
            }`}
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

const edgeTypes = {
  smoothstep: RemovableEdge,
  default: RemovableEdge,
  removable: RemovableEdge
};

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

    // 2. Branch edges (YES / NO / Default / Found / Not Found)
    if (node.branches && node.branches.length > 0) {
      node.branches.forEach((branch: any, bIdx: number) => {
        const val = branch.conditionValue?.toLowerCase() || '';
        const isYes = val === 'yes' || val.includes('yes') || val.includes('true') || val.includes('found');
        const isNo = val === 'no' || val.includes('no') || val.includes('false') || val.includes('not found');

        let strokeColor = '#f59e0b';
        let sourceHandle: string | undefined = undefined;
        let label = branch.conditionValue || 'Condition';

        if (node.type === 'verify_data') {
          if (isYes) {
            strokeColor = '#059669';
            sourceHandle = 'yes';
            label = 'Found in Sheet (True)';
          } else if (isNo) {
            strokeColor = '#e11d48';
            sourceHandle = 'no';
            label = 'Not Found in Sheet (False)';
          }
        } else if (isYes) {
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

    // Direct Success / Failure edges for verify_data if branches were not explicitly set
    if (node.type === 'verify_data' && (!node.branches || node.branches.length === 0)) {
      if (node.config?.onSuccessStepId) {
        rfEdges.push({
          id: `e-verify-success-${node.id}-${node.config.onSuccessStepId}`,
          source: node.id,
          sourceHandle: 'yes',
          target: node.config.onSuccessStepId,
          type: 'smoothstep',
          animated: true,
          label: 'Found in Sheet (True)',
          labelStyle: { fill: '#059669', fontWeight: 700, fontSize: 10 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9, rx: 4, ry: 4 },
          style: { stroke: '#059669', strokeWidth: 2.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#059669' }
        });
      }
      if (node.config?.onFailureStepId) {
        rfEdges.push({
          id: `e-verify-failure-${node.id}-${node.config.onFailureStepId}`,
          source: node.id,
          sourceHandle: 'no',
          target: node.config.onFailureStepId,
          type: 'smoothstep',
          animated: true,
          label: 'Not Found in Sheet (False)',
          labelStyle: { fill: '#e11d48', fontWeight: 700, fontSize: 10 },
          labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9, rx: 4, ry: 4 },
          style: { stroke: '#e11d48', strokeWidth: 2.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#e11d48' }
        });
      }
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
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);
  const [aiNotification, setAiNotification] = useState<string | null>(null);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(true);

  // Keyboard shortcut: Press Escape to exit Fullscreen Focus Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFocusMode) {
        setIsFocusMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocusMode]);

  const handleApplyAIGeneratedWorkflow = (generatedData: {
    name?: string;
    description?: string;
    explanation?: string;
    nodes: any[];
  }) => {
    if (generatedData.nodes && generatedData.nodes.length > 0) {
      const graph = convertWorkflowToGraph(generatedData.nodes);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      setSelectedNode(null);
      setSelectedEdge(null);
      setAiNotification(
        `✨ AI generated ${generatedData.nodes.length} nodes! ${generatedData.explanation || 'Review nodes on canvas and click Save Workflow.'}`
      );
      setTimeout(() => setAiNotification(null), 10000);
    }
  };

  const edgeReconnectSuccessful = useRef(true);

  // Sync if external workflow changes
  useEffect(() => {
    const graph = convertWorkflowToGraph(workflow?.nodes || workflow?.steps || []);
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setSelectedNode(null);
    setSelectedEdge(null);
  }, [workflow]);

  // Listen for delete button clicks rendered on edge pills
  useEffect(() => {
    const handleDeleteEdge = (e: any) => {
      const edgeId = e.detail?.id;
      if (edgeId) {
        setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
        setSelectedEdge((curr) => (curr && curr.id === edgeId ? null : curr));
      }
    };
    window.addEventListener('flowdesk:delete-edge', handleDeleteEdge);
    return () => window.removeEventListener('flowdesk:delete-edge', handleDeleteEdge);
  }, []);

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
    (changes: EdgeChange[]) => {
      const removedEdgeIds = changes.filter((c) => c.type === 'remove').map((c: any) => c.id);
      if (removedEdgeIds.length > 0) {
        setSelectedEdge((curr) => (curr && removedEdgeIds.includes(curr.id) ? null : curr));
      }
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    []
  );

  // Edge Reconnection: Drag arrow endpoint off socket to disconnect or re-link to another node
  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
    edgeReconnectSuccessful.current = true;
    setEdges((els) => reconnectEdge(oldEdge, newConnection, els));
  }, []);

  const onReconnectEnd = useCallback((_: any, edge: Edge) => {
    if (!edgeReconnectSuccessful.current) {
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      setSelectedEdge((curr) => (curr && curr.id === edge.id ? null : curr));
    }
    edgeReconnectSuccessful.current = true;
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      const sourceNode = nodes.find((n) => n.id === params.source);
      let label: string | undefined = undefined;
      let strokeColor = '#059669';

      if (sourceNode?.type === 'verify_data') {
        if (params.sourceHandle === 'yes') {
          label = 'Found in Sheet (True)';
          strokeColor = '#059669';
        } else if (params.sourceHandle === 'no') {
          label = 'Not Found in Sheet (False)';
          strokeColor = '#e11d48';
        }
      } else if (params.sourceHandle === 'yes') {
        label = 'YES (Button)';
        strokeColor = '#059669';
      } else if (params.sourceHandle === 'no') {
        label = 'NO (Button)';
        strokeColor = '#e11d48';
      }

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'removable',
            animated: true,
            label,
            labelStyle: label ? { fill: strokeColor, fontWeight: 700, fontSize: 10 } : undefined,
            labelBgStyle: label ? { fill: '#ffffff', fillOpacity: 0.9, rx: 4, ry: 4 } : undefined,
            style: { stroke: strokeColor, strokeWidth: 2.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor }
          },
          eds
        )
      );
    },
    [nodes]
  );

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  };

  const onEdgeClick = (_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  };

  const onPaneClick = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
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
    } else if (type === 'ai_parse') {
      baseConfig.sourceVariable = 'lastReply';
      baseConfig.fields = [
        { name: 'working', description: 'Currently working or not (Yes/No)' },
        { name: 'experience', description: 'Years of work experience' },
        { name: 'age', description: 'Age of candidate' },
        { name: 'Excel', description: 'Excel knowledge level' },
        { name: 'current CTC', description: 'Current salary/CTC' },
        { name: 'expected CTC', description: 'Expected salary/CTC' },
        { name: 'location', description: 'Residential location or city' },
        { name: 'notice period', description: 'Notice period in days or months' }
      ];
    } else if (type === 'delay') {
      baseConfig.delayValue = 12;
      baseConfig.delayUnit = 'hours';
      baseConfig.messageTemplate = 'Good morning {{firstName}}, reminder for your interview today! Are you on your way?';
      baseConfig.buttons = [
        { id: 'btn_yes', title: 'Yes, On My Way' },
        { id: 'btn_reschedule', title: 'Need to Reschedule' }
      ];
      baseConfig.cancelOnReply = true;
      baseConfig.waitForReply = true;
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
            : type === 'verify_data'
            ? [
                { conditionType: 'equals', conditionValue: 'true, yes, verified, found', targetStepId: '' },
                { conditionType: 'equals', conditionValue: 'false, no, not found, unverified', targetStepId: '' }
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

      const nodeConfig = { ...((node.data as any).config || {}) };
      delete nodeConfig.tagsRaw;
      delete nodeConfig.keywordsRaw;
      delete nodeConfig.customColumnsRaw;
      if (typeof nodeConfig.customColumns === 'string') {
        const parsed = nodeConfig.customColumns.split(',').map((s: string) => s.trim()).filter(Boolean);
        nodeConfig.customColumns = parsed.length > 0 ? parsed : undefined;
      }

      let nextStepId: string | null = null;
      const branches: any[] = [];

      outgoingEdges.forEach((edge) => {
        const configuredYes = (node.data as any).config?.yesValue || 'YES, Interested, Apply, Sure';
        const configuredNo = (node.data as any).config?.noValue || 'NO, Not Interested, Decline';

        if (edge.sourceHandle === 'yes') {
          const yesVal = node.type === 'verify_data' ? 'true, yes, verified, found' : configuredYes;
          branches.push({
            conditionType: 'equals',
            conditionValue: yesVal,
            targetStepId: edge.target
          });
          nodeConfig.trueStepId = edge.target;
          nodeConfig.onSuccessStepId = edge.target;
        } else if (edge.sourceHandle === 'no') {
          const noVal = node.type === 'verify_data' ? 'false, no, not found, unverified' : configuredNo;
          branches.push({
            conditionType: 'equals',
            conditionValue: noVal,
            targetStepId: edge.target
          });
          nodeConfig.falseStepId = edge.target;
          nodeConfig.onFailureStepId = edge.target;
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
          ...nodeConfig,
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
    <div
      className={cn(
        isFocusMode
          ? 'fixed inset-0 z-40 w-screen h-screen flex flex-col bg-slate-100 overflow-hidden shadow-2xl animate-in fade-in duration-150'
          : 'flex flex-col h-full min-h-0 flex-1 bg-slate-900/5 rounded-2xl border border-slate-200 overflow-hidden relative shadow-xs'
      )}
    >
      {/* Canvas Top Bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 z-10 shadow-2xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            Visual Workflow Designer
          </span>
          <Badge variant="slate" className="text-xs">
            {nodes.length} nodes · {edges.length} connections
          </Badge>
          {isFocusMode && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full shadow-2xs animate-fade-in">
              🎯 Fullscreen Focus Active
            </span>
          )}
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
              <span className="hidden sm:inline">Delete Node</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAIGeneratorOpen(true)}
            className="flex items-center gap-1.5 text-xs text-purple-700 border-purple-300 hover:bg-purple-50 font-bold shadow-2xs"
            title="Upload an SOP document or paste scripts to auto-generate this workflow with AI"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span className="hidden sm:inline">Generate with AI</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onTriggerTest}
            className="flex items-center gap-1.5 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
          >
            <Play className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" />
            <span className="hidden sm:inline">Test Live on Mobile</span>
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

          {/* Fullscreen / Focus Mode Toggle Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFocusMode(!isFocusMode)}
            className={cn(
              'flex items-center gap-1.5 text-xs font-semibold transition-all',
              isFocusMode
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-sm'
                : 'text-slate-700 hover:text-slate-900 border-slate-300 hover:bg-slate-100'
            )}
            title={
              isFocusMode
                ? 'Exit Fullscreen Focus Mode (Press Esc or Click)'
                : 'Full Screen Focus Mode (Hide sidebars & headers for maximum workspace)'
            }
          >
            {isFocusMode ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Exit Focus</span>
                <kbd className="hidden sm:inline-block text-[10px] bg-indigo-500 text-white px-1.5 py-0.2 rounded font-mono ml-0.5">
                  Esc
                </kbd>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
                <span>Focus Mode</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {aiNotification && (
        <div className="bg-gradient-to-r from-purple-50 via-emerald-50 to-purple-50 border-b border-purple-200 px-4 py-2 flex items-center justify-between text-xs text-purple-950 animate-fade-in shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
            <span className="font-medium">{aiNotification}</span>
          </div>
          <button
            onClick={() => setAiNotification(null)}
            className="text-purple-600 hover:text-purple-900 p-0.5 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 flex relative min-h-0 overflow-hidden w-full">
        {/* Left Toolbar / Node Palette (Collapsible) */}
        {isPaletteOpen ? (
          <div className="w-56 bg-slate-50 border-r border-slate-200 p-3 z-10 space-y-3 overflow-y-auto shrink-0 animate-in slide-in-from-left-2 duration-150">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Add Nodes
              </span>
              <button
                type="button"
                onClick={() => setIsPaletteOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200 transition-colors"
                title="Collapse node palette for maximum canvas workspace"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

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
              onClick={() => handleAddNode('ai_parse', 'AI Form / Entity Extractor')}
              className="w-full text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-violet-500 hover:shadow-xs transition-all flex items-center gap-2 text-xs font-semibold text-slate-800 group"
            >
              <div className="p-1 rounded bg-violet-100 text-violet-700 group-hover:bg-violet-600 group-hover:text-white transition-colors">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block truncate">AI Entity Extractor</span>
                <span className="text-[10px] text-slate-500 font-normal">Extract Form Data</span>
              </div>
            </button>

            <button
              onClick={() => handleAddNode('delay', 'Wait & Follow-Up')}
              className="w-full text-left p-2.5 rounded-xl bg-white border border-slate-200 hover:border-amber-500 hover:shadow-xs transition-all flex items-center gap-2 text-xs font-semibold text-slate-800 group"
            >
              <div className="p-1 rounded bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="block truncate">Wait & Follow-Up</span>
                <span className="text-[10px] text-slate-500 font-normal">Timed Nudge & Reminder</span>
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
        ) : null}

        {/* Main Canvas Workspace */}
        <div className="flex-1 h-full bg-slate-50/50 relative">
          {!isPaletteOpen && (
            <button
              type="button"
              onClick={() => setIsPaletteOpen(true)}
              className="absolute left-3 top-3 z-20 px-2.5 py-1.5 rounded-lg bg-white/95 backdrop-blur-xs border border-slate-300 shadow-md text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-1.5 transition-all hover:scale-105"
              title="Expand Node Palette"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              <span>Add Nodes</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
            </button>
          )}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            edgesReconnectable={true}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
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
                if (n.type === 'delay') return '#d97706';
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
                  {/* Meta Template Configuration (For Cold Broadcasts / Outreach) */}
                  <div className="p-2.5 rounded-lg bg-sky-50/70 border border-sky-200/80 space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean((selectedNode.data as any).config?.templateName)}
                        onChange={(e) => {
                          const newConfig = {
                            ...(selectedNode.data as any).config,
                            templateName: e.target.checked ? 'candidate_screening_v1_' : '',
                            templateLanguage: e.target.checked ? 'en' : ''
                          };
                          handleUpdateSelectedNode({ config: newConfig });
                        }}
                        className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <div>
                        <span className="text-xs font-semibold text-slate-800">
                          Use Approved Meta Template
                        </span>
                        <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                          Required when broadcasting cold outreach campaigns to contacts outside the 24h window.
                        </p>
                      </div>
                    </label>

                    {Boolean((selectedNode.data as any).config?.templateName) && (
                      <div className="pt-1.5 space-y-1.5 border-t border-sky-200/60">
                        <div>
                          <label className="text-[11px] font-semibold text-sky-900 block">Template Name (from WhatsApp Manager)</label>
                          <input
                            type="text"
                            placeholder="e.g. candidate_screening_v1_"
                            value={(selectedNode.data as any).config?.templateName || ''}
                            onChange={(e) => {
                              handleUpdateSelectedNode({
                                config: { ...(selectedNode.data as any).config, templateName: e.target.value }
                              });
                            }}
                            className="w-full px-2.5 py-1 text-xs bg-white border border-sky-300 rounded font-mono text-sky-900 font-semibold"
                          />
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-[10px] font-semibold text-sky-900 block">Language Code</label>
                            <input
                              type="text"
                              placeholder="en"
                              value={(selectedNode.data as any).config?.templateLanguage || 'en'}
                              onChange={(e) => {
                                handleUpdateSelectedNode({
                                  config: { ...(selectedNode.data as any).config, templateLanguage: e.target.value }
                                });
                              }}
                              className="w-full px-2.5 py-1 text-xs bg-white border border-sky-300 rounded font-mono text-sky-900"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Message Body (or Template Preview)</label>
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

                  {/* Wait for Candidate Reply Toggle */}
                  <div className="pt-2 border-t border-slate-200">
                    <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/80">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(selectedNode.data as any).config?.waitForReply === true}
                          onChange={(e) => {
                            const newConfig = {
                              ...(selectedNode.data as any).config,
                              waitForReply: e.target.checked
                            };
                            handleUpdateSelectedNode({ config: newConfig });
                          }}
                          className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div>
                          <span className="text-xs font-semibold text-slate-800">
                            Wait for candidate reply before advancing
                          </span>
                          <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                            Pauses the workflow after sending this message until the candidate sends a response. Required when asking questions.
                          </p>
                        </div>
                      </label>
                    </div>
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
                    <label className="text-xs font-semibold text-slate-700">Google Sheet URL</label>
                    <input
                      type="text"
                      placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                      value={(selectedNode.data as any).config?.spreadsheetUrl || ''}
                      onChange={(e) => {
                        handleUpdateSelectedNode({
                          config: { ...(selectedNode.data as any).config, spreadsheetUrl: e.target.value }
                        });
                      }}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-mono"
                    />
                    <p className="text-[10px] text-slate-500">
                      Direct Google Sheets share link. Shared with Service Account email.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Sheet / Tab Name</label>
                    <input
                      type="text"
                      placeholder="e.g. response or Sheet1"
                      value={(selectedNode.data as any).config?.sheetName || 'response'}
                      onChange={(e) => {
                        handleUpdateSelectedNode({
                          config: { ...(selectedNode.data as any).config, sheetName: e.target.value }
                        });
                      }}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Candidate Input & Extraction</label>
                    <select
                      value={(selectedNode.data as any).config?.extractionMode || 'auto_detect_reply'}
                      onChange={(e) => {
                        handleUpdateSelectedNode({
                          config: { ...(selectedNode.data as any).config, extractionMode: e.target.value }
                        });
                      }}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900"
                    >
                      <option value="auto_detect_reply">Wait for Candidate Reply (Auto-detect Phone, Email, or Survey ID)</option>
                      <option value="whatsapp_phone_instant">Check WhatsApp Phone Immediately (No waiting)</option>
                      <option value="phone_from_reply">Extract Phone Number from Candidate Reply</option>
                      <option value="survey_id_from_reply">Extract Survey ID / Code from Candidate Reply</option>
                      <option value="email_from_reply">Extract Email from Candidate Reply</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Column to Match in Sheet</label>
                    <select
                      value={(selectedNode.data as any).config?.matchField || 'auto'}
                      onChange={(e) => {
                        handleUpdateSelectedNode({
                          config: { ...(selectedNode.data as any).config, matchField: e.target.value }
                        });
                      }}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900"
                    >
                      <option value="auto">Auto-Detect Header (Phone / Survey ID / Email)</option>
                      <option value="phone">Phone Column</option>
                      <option value="surveyId">Survey ID / Code Column</option>
                      <option value="email">Email Column</option>
                    </select>
                  </div>

                  {/* Direct Branching Sockets Explainer */}
                  <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200 text-xs text-teal-900 space-y-2">
                    <div className="font-bold flex items-center gap-1.5 text-teal-800">
                      <GitBranch className="w-4 h-4 text-teal-700" />
                      Direct Decision Sockets (No extra condition node!)
                    </div>
                    <p className="text-[11px] text-teal-800/90 leading-relaxed">
                      Connect arrows directly from this node's two bottom handles:
                    </p>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex items-center gap-1.5 font-semibold text-emerald-800 bg-white/90 p-1.5 rounded border border-emerald-200">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                        <span>Found (True): Connect to Success message or Append Sheet</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold text-rose-800 bg-white/90 p-1.5 rounded border border-rose-200">
                        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                        <span>Not Found (False): Connect to Retry or Human Agent</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. Append / Write to Spreadsheet Node */}
              {selectedNode.type === 'append_to_sheet' && (() => {
                const config = (selectedNode.data as any).config || {};
                const mode = config.mode || 'upsert';
                const lookupKey = config.lookupKey || 'phone';
                const mappings: Array<{ sheetColumn: string; value: string }> =
                  Array.isArray(config.columnMappings) && config.columnMappings.length > 0
                    ? config.columnMappings
                    : [
                        { sheetColumn: 'Name', value: '{{firstName}} {{lastName}}' },
                        { sheetColumn: 'Phone', value: '{{phone}}' },
                        { sheetColumn: 'Email', value: '{{candidateEmail}}' },
                        { sheetColumn: 'Status', value: 'Verified' },
                        { sheetColumn: 'Survey-ID', value: '{{verifiedSurveyId}}' },
                        { sheetColumn: 'Timestamp', value: '{{$timestamp}}' }
                      ];

                const updateMappings = (newMappings: Array<{ sheetColumn: string; value: string }>) => {
                  handleUpdateSelectedNode({
                    config: { ...config, columnMappings: newMappings }
                  });
                };

                return (
                  <div className="space-y-3.5 pt-2 text-xs">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Google Sheet URL or ID</label>
                      <input
                        type="text"
                        placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                        value={config.spreadsheetUrl || ''}
                        onChange={(e) => {
                          handleUpdateSelectedNode({
                            config: { ...config, spreadsheetUrl: e.target.value }
                          });
                        }}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-mono"
                      />
                      <p className="text-[10px] text-slate-500">
                        Paste the full Google Sheets link here.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Sheet / Tab Name</label>
                      <input
                        type="text"
                        value={config.sheetName || 'Responses'}
                        onChange={(e) => {
                          handleUpdateSelectedNode({
                            config: { ...config, sheetName: e.target.value }
                          });
                        }}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-mono"
                      />
                    </div>

                    {/* Wait for Candidate Reply Toggle */}
                    <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/80">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.waitForReply === true}
                          onChange={(e) => {
                            handleUpdateSelectedNode({
                              config: { ...config, waitForReply: e.target.checked }
                            });
                          }}
                          className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div>
                          <span className="text-xs font-semibold text-slate-800">
                            Wait for candidate reply before writing to sheet
                          </span>
                          <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                            Pauses the workflow until candidate answers are received, preventing blank rows in Google Sheets.
                          </p>
                        </div>
                      </label>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Operation Mode</label>
                      <select
                        value={mode}
                        onChange={(e) => {
                          handleUpdateSelectedNode({
                            config: { ...config, mode: e.target.value }
                          });
                        }}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-medium"
                      >
                        <option value="upsert">Smart Upsert: Update if exists, otherwise Append (Safest)</option>
                        <option value="append">Append Only: Always add new row at bottom</option>
                        <option value="update">Update Only: Update existing candidate row</option>
                      </select>
                    </div>

                    {mode !== 'append' && (
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700">Lookup Key (Find candidate row by)</label>
                        <select
                          value={lookupKey}
                          onChange={(e) => {
                            handleUpdateSelectedNode({
                              config: { ...config, lookupKey: e.target.value }
                            });
                          }}
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900"
                        >
                          <option value="phone">Candidate Phone Number (Columns matching Phone / Mobile)</option>
                          <option value="surveyId">Survey ID / Verification Code</option>
                          <option value="email">Email Address</option>
                        </select>
                      </div>
                    )}

                    {/* Visual Column Mapping Table */}
                    <div className="space-y-2 pt-1 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-800">Column Mapping (Sheet ➔ Value)</label>
                        <button
                          type="button"
                          onClick={() => {
                            updateMappings([...mappings, { sheetColumn: 'New Column', value: '{{phone}}' }]);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200"
                        >
                          <Plus className="w-3 h-3" />
                          Add Column
                        </button>
                      </div>

                      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5">
                        {mappings.map((m, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                            <input
                              type="text"
                              title="Sheet Column Header Name"
                              placeholder="Header Name"
                              value={m.sheetColumn}
                              onChange={(e) => {
                                const next = [...mappings];
                                next[idx].sheetColumn = e.target.value;
                                updateMappings(next);
                              }}
                              className="w-[38%] px-2 py-1 text-[11px] bg-white border border-slate-300 rounded font-semibold text-slate-800"
                            />
                            <span className="text-slate-400 font-bold text-[10px]">➔</span>
                            <input
                              type="text"
                              title="Value or Variable to write"
                              placeholder="{{phone}}"
                              value={m.value}
                              onChange={(e) => {
                                const next = [...mappings];
                                next[idx].value = e.target.value;
                                updateMappings(next);
                              }}
                              className="flex-1 min-w-0 px-2 py-1 text-[11px] bg-white border border-slate-300 rounded font-mono text-emerald-800"
                            />
                            {mappings.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  updateMappings(mappings.filter((_, i) => i !== idx));
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-white"
                                title="Remove Column"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 text-[10px] text-emerald-900 space-y-1">
                        <p className="font-bold flex items-center gap-1 text-emerald-800">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                          {mode === 'upsert' ? 'Smart Upsert Mode' : mode === 'update' ? 'In-Place Update Mode' : 'Append Row Mode'}
                        </p>
                        <p className="text-[10px] text-emerald-800/90 leading-tight">
                          {mode === 'upsert'
                            ? 'If the candidate is already in the sheet, their existing row is updated in place. If new, a row is appended at the bottom.'
                            : mode === 'update'
                            ? 'Searches for the candidate by their lookup key and modifies only the specified columns without creating duplicates.'
                            : 'Appends a brand new row at the bottom of the sheet for every completed run.'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 5. Update Contact Record Node */}
              {selectedNode.type === 'update_record' && (
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-semibold text-slate-700">Add Tags to Contact</label>
                  <input
                    type="text"
                    placeholder="interested, screened, interview_ready"
                    value={
                      (selectedNode.data as any).config?.tagsRaw !== undefined
                        ? (selectedNode.data as any).config.tagsRaw
                        : ((selectedNode.data as any).config?.operations || [])
                            .filter((op: any) => op.action === 'add_tag')
                            .map((op: any) => op.value)
                            .join(', ') || ''
                    }
                    onChange={(e) => {
                      const tagsRaw = e.target.value;
                      const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
                      const ops = tags.map((t) => ({ action: 'add_tag', value: t }));
                      handleUpdateSelectedNode({
                        config: { ...(selectedNode.data as any).config, operations: ops, tagsRaw }
                      });
                    }}
                    onBlur={() => {
                      const cfg = { ...(selectedNode.data as any).config };
                      delete cfg.tagsRaw;
                      handleUpdateSelectedNode({ config: cfg });
                    }}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-[10px] text-slate-400 block">Comma-separated tags (e.g. interested, screened)</span>
                </div>
              )}

              {/* 5b. AI Entity & Form Extractor Node */}
              {selectedNode.type === 'ai_parse' && (() => {
                const config = (selectedNode.data as any).config || {};
                const rawFields = config.fields;
                const fields: Array<{ name: string; description?: string }> = Array.isArray(rawFields)
                  ? rawFields.map((f: any) => (typeof f === 'string' ? { name: f, description: '' } : f))
                  : [
                      { name: 'working', description: 'Currently working or not' },
                      { name: 'experience', description: 'Years of experience' },
                      { name: 'age', description: 'Age' },
                      { name: 'Excel', description: 'Excel knowledge' },
                      { name: 'current CTC', description: 'Current CTC' },
                      { name: 'expected CTC', description: 'Expected CTC' },
                      { name: 'location', description: 'Location' },
                      { name: 'notice period', description: 'Notice period' }
                    ];

                const updateFields = (newFields: Array<{ name: string; description?: string }>) => {
                  handleUpdateSelectedNode({
                    config: { ...config, fields: newFields }
                  });
                };

                return (
                  <div className="space-y-3.5 pt-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-violet-50/70 border border-violet-200 text-violet-900 space-y-1">
                      <p className="font-bold flex items-center gap-1.5 text-violet-800">
                        <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                        Multilingual Form & Entity Extractor
                      </p>
                      <p className="text-[10px] text-violet-800/80 leading-tight">
                        Uses AI to extract structured answers from free-form candidate replies (English, Hindi, Hinglish, messy paragraphs) and stores them as workflow variables.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Source Variable</label>
                      <input
                        type="text"
                        value={config.sourceVariable || 'lastReply'}
                        onChange={(e) => {
                          handleUpdateSelectedNode({
                            config: { ...config, sourceVariable: e.target.value }
                          });
                        }}
                        placeholder="lastReply"
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-mono"
                      />
                      <span className="text-[10px] text-slate-400 block">Default: lastReply (incoming WhatsApp text)</span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-800">
                          Target Fields to Extract ({fields.length})
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            updateFields([...fields, { name: `field_${fields.length + 1}`, description: '' }]);
                          }}
                          className="px-2 py-0.5 text-[11px] font-semibold text-violet-700 bg-violet-100 hover:bg-violet-200 rounded flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Add Field
                        </button>
                      </div>

                      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                        {fields.map((field, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-slate-50 border border-slate-200">
                            <span className="text-[10px] font-mono text-violet-600 shrink-0 font-bold">
                              {`{{`}
                            </span>
                            <input
                              type="text"
                              value={field.name}
                              onChange={(e) => {
                                const next = [...fields];
                                next[idx] = { ...next[idx], name: e.target.value };
                                updateFields(next);
                              }}
                              placeholder="fieldName"
                              className="flex-1 min-w-0 px-2 py-1 text-[11px] bg-white border border-slate-300 rounded font-mono font-medium text-slate-900"
                            />
                            <span className="text-[10px] font-mono text-violet-600 shrink-0 font-bold">
                              {`}}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                updateFields(fields.filter((_, i) => i !== idx));
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-white"
                              title="Remove Field"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500 italic">
                        Each field becomes available in Google Sheets as {'{{fieldName}}'}.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700">Custom Prompt Instructions (Optional)</label>
                      <textarea
                        rows={2}
                        value={config.instructions || ''}
                        onChange={(e) => {
                          handleUpdateSelectedNode({
                            config: { ...config, instructions: e.target.value }
                          });
                        }}
                        placeholder="e.g. For Excel knowledge, normalize to Basic, Intermediate, or Advanced."
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900"
                      />
                    </div>
                  </div>
                );
              })()}

              {/* 5c. Wait & Follow-Up (Nudge) Node */}
              {selectedNode.type === 'delay' && (() => {
                const config = (selectedNode.data as any).config || {};
                const delayValue = config.delayValue ?? config.duration ?? 12;
                const delayUnit = config.delayUnit || 'hours';
                const buttons: Array<{ id: string; title: string }> = config.buttons || [];
                const cancelOnReply = config.cancelOnReply === true;
                const waitForReply = config.waitForReply === true;

                const setPreset = (val: number, unit: string) => {
                  handleUpdateSelectedNode({
                    config: {
                      ...config,
                      delayValue: val,
                      delayUnit: unit
                    }
                  });
                };

                return (
                  <div className="space-y-4 pt-1 text-xs">
                    {/* Header Banner */}
                    <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-950 space-y-1">
                      <p className="font-bold flex items-center gap-1.5 text-amber-800">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        Wait & Automated Follow-Up (Nudge)
                      </p>
                      <p className="text-[10px] text-amber-800/80 leading-tight">
                        Pauses workflow execution for a set duration, then automatically dispatches a WhatsApp reminder.
                      </p>
                    </div>

                    {/* Delay Duration & Unit */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-800">Wait Duration</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={1}
                          value={delayValue}
                          onChange={(e) => {
                            const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                            handleUpdateSelectedNode({
                              config: { ...config, delayValue: val }
                            });
                          }}
                          className="w-1/2 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <select
                          value={delayUnit}
                          onChange={(e) => {
                            handleUpdateSelectedNode({
                              config: { ...config, delayUnit: e.target.value }
                            });
                          }}
                          className="w-1/2 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
                        >
                          <option value="minutes">Minutes</option>
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                        </select>
                      </div>

                      {/* Quick Presets */}
                      <div className="flex flex-wrap gap-1 pt-1">
                        <span className="text-[10px] text-slate-400 self-center mr-1">Presets:</span>
                        <button
                          type="button"
                          onClick={() => setPreset(15, 'minutes')}
                          className="px-2 py-0.5 text-[10px] bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 rounded border border-slate-200 transition-colors"
                        >
                          15m
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreset(1, 'hours')}
                          className="px-2 py-0.5 text-[10px] bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 rounded border border-slate-200 transition-colors"
                        >
                          1h
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreset(8, 'hours')}
                          className="px-2 py-0.5 text-[10px] bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 rounded border border-slate-200 transition-colors"
                        >
                          8h
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreset(12, 'hours')}
                          className="px-2 py-0.5 text-[10px] bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 rounded border border-slate-200 transition-colors"
                        >
                          12h
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreset(20, 'hours')}
                          className="px-2 py-0.5 text-[10px] bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 rounded border border-slate-200 transition-colors"
                        >
                          20h
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreset(24, 'hours')}
                          className="px-2 py-0.5 text-[10px] bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 rounded border border-slate-200 transition-colors"
                        >
                          24h
                        </button>
                      </div>
                    </div>

                    {/* Follow-up Message Textarea */}
                    <div className="space-y-1 pt-1 border-t border-slate-200">
                      <label className="text-xs font-semibold text-slate-700">Follow-Up Message Text</label>
                      <textarea
                        rows={3}
                        value={config.messageTemplate || config.body || ''}
                        onChange={(e) => {
                          handleUpdateSelectedNode({
                            config: { ...config, messageTemplate: e.target.value }
                          });
                        }}
                        placeholder="Good morning {{firstName}}, reminder for your interview today! Are you on your way?"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                      />
                      <span className="text-[10px] text-slate-400 block">
                        Supports variables: {'{{firstName}}'}, {'{{role}}'}, {'{{company}}'}
                      </span>
                    </div>

                    {/* Interactive Quick-Reply Buttons */}
                    <div className="space-y-2.5 pt-2 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
                          Quick-Reply Buttons ({buttons.length}/3)
                        </label>
                        {buttons.length < 3 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newBtn = {
                                id: `btn_${buttons.length + 1}`,
                                title: buttons.length === 0 ? 'Yes, On My Way' : 'Need to Reschedule'
                              };
                              handleUpdateSelectedNode({
                                config: { ...config, buttons: [...buttons, newBtn] }
                              });
                            }}
                            className="px-2 py-1 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-md transition-colors flex items-center gap-1 shadow-2xs"
                          >
                            <Plus className="w-3 h-3" /> Add Button
                          </button>
                        )}
                      </div>

                      {buttons.length === 0 ? (
                        <p className="text-[10px] text-slate-500 italic">
                          No quick-reply buttons added. Will send as a plain WhatsApp text message.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {buttons.map((btn, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 p-2 rounded-lg bg-amber-50/70 border border-amber-200"
                            >
                              <div className="w-2 h-2 rounded-full bg-amber-600 shrink-0" />
                              <input
                                type="text"
                                maxLength={20}
                                value={btn.title}
                                onChange={(e) => {
                                  const updated = [...buttons];
                                  updated[idx] = { ...updated[idx], title: e.target.value };
                                  handleUpdateSelectedNode({
                                    config: { ...config, buttons: updated }
                                  });
                                }}
                                placeholder={`Button ${idx + 1}`}
                                className="flex-1 px-2.5 py-1 text-xs bg-white border border-amber-300 rounded text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                              />
                              <span className="text-[9px] font-mono text-slate-400 shrink-0">{btn.title.length}/20</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const filtered = buttons.filter((_, bIdx) => bIdx !== idx);
                                  handleUpdateSelectedNode({
                                    config: { ...config, buttons: filtered }
                                  });
                                }}
                                className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 transition-colors"
                                title="Delete button"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Meta 24-Hour Window & Template Fallback */}
                    <div className="p-2.5 rounded-lg bg-sky-50/70 border border-sky-200/80 space-y-2">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(config.templateName)}
                          onChange={(e) => {
                            handleUpdateSelectedNode({
                              config: {
                                ...config,
                                templateName: e.target.checked ? 'candidate_screening_v1_' : '',
                                templateLanguage: e.target.checked ? 'en' : ''
                              }
                            });
                          }}
                          className="mt-0.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <div>
                          <span className="text-xs font-semibold text-slate-800">
                            Meta Template Fallback (for &gt;24h)
                          </span>
                          <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                            Required by Meta if follow-up fires after 24 hours since the candidate's last message.
                          </p>
                        </div>
                      </label>

                      {Boolean(config.templateName) && (
                        <div className="pt-1.5 space-y-1.5 border-t border-sky-200/60">
                          <div>
                            <label className="text-[11px] font-semibold text-sky-900 block">Template Name</label>
                            <input
                              type="text"
                              placeholder="e.g. candidate_screening_v1_"
                              value={config.templateName || ''}
                              onChange={(e) => {
                                handleUpdateSelectedNode({
                                  config: { ...config, templateName: e.target.value }
                                });
                              }}
                              className="w-full px-2.5 py-1 text-xs bg-white border border-sky-300 rounded font-mono text-sky-900 font-semibold"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-sky-900 block">Language Code</label>
                            <input
                              type="text"
                              placeholder="en"
                              value={config.templateLanguage || 'en'}
                              onChange={(e) => {
                                handleUpdateSelectedNode({
                                  config: { ...config, templateLanguage: e.target.value }
                                });
                              }}
                              className="w-full px-2.5 py-1 text-xs bg-white border border-sky-300 rounded font-mono text-sky-900"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Automation Rules: Cancel on Reply & Wait for Reply */}
                    <div className="space-y-2 pt-1 border-t border-slate-200">
                      <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200/80">
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cancelOnReply}
                            onChange={(e) => {
                              handleUpdateSelectedNode({
                                config: { ...config, cancelOnReply: e.target.checked }
                              });
                            }}
                            className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div>
                            <span className="text-xs font-semibold text-slate-800">
                              Auto-cancel if candidate replies early
                            </span>
                            <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                              If the candidate replies before the timer expires, immediately cancel this nudge and proceed.
                            </p>
                          </div>
                        </label>
                      </div>

                      {/* Smart Silence Guard (Inactivity Buffer) */}
                      <div className="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-200/80 space-y-2">
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={config.enableInactivityGuard === true}
                            onChange={(e) => {
                              handleUpdateSelectedNode({
                                config: {
                                  ...config,
                                  enableInactivityGuard: e.target.checked,
                                  inactivityBufferValue: config.inactivityBufferValue ?? 30,
                                  inactivityBufferUnit: config.inactivityBufferUnit || 'minutes'
                                }
                              });
                            }}
                            className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div>
                            <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                              <span>🛡️ Smart Silence Guard</span>
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-300">
                                Customizable
                              </span>
                            </span>
                            <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                              Skip follow-up if candidate was active recently, preventing awkward nudges to someone already chatting.
                            </p>
                          </div>
                        </label>

                        {config.enableInactivityGuard === true && (
                          <div className="pt-2 border-t border-indigo-200/60 space-y-1.5 pl-6">
                            <label className="text-[11px] font-semibold text-indigo-950 block">
                              Skip follow-up if candidate messaged within last:
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                min={1}
                                max={1440}
                                value={config.inactivityBufferValue ?? 30}
                                onChange={(e) => {
                                  const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                                  handleUpdateSelectedNode({
                                    config: { ...config, inactivityBufferValue: val }
                                  });
                                }}
                                className="w-1/2 px-2.5 py-1 text-xs bg-white border border-indigo-300 rounded font-bold text-slate-900 focus:ring-1 focus:ring-indigo-500"
                              />
                              <select
                                value={config.inactivityBufferUnit || 'minutes'}
                                onChange={(e) => {
                                  handleUpdateSelectedNode({
                                    config: { ...config, inactivityBufferUnit: e.target.value }
                                  });
                                }}
                                className="w-1/2 px-2 py-1 text-xs bg-white border border-indigo-300 rounded text-slate-900 font-medium focus:ring-1 focus:ring-indigo-500"
                              >
                                <option value="minutes">Minutes</option>
                                <option value="hours">Hours</option>
                              </select>
                            </div>
                            <span className="text-[10px] text-indigo-700/80 block italic">
                              Example: If candidate messaged 5 minutes ago, this follow-up is skipped. If silent for hours, it sends normally.
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/80">
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={waitForReply}
                            onChange={(e) => {
                              handleUpdateSelectedNode({
                                config: { ...config, waitForReply: e.target.checked }
                              });
                            }}
                            className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                          />
                          <div>
                            <span className="text-xs font-semibold text-slate-800">
                              Wait for reply after reminder is sent
                            </span>
                            <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                              Pauses workflow after sending this reminder until candidate taps a button or replies.
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 6. Inbound Trigger Node */}
              {selectedNode.type === 'trigger' && (
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-semibold text-slate-700">Trigger Keywords</label>
                  <input
                    type="text"
                    placeholder="APPLY, HI, JOB"
                    value={
                      (selectedNode.data as any).config?.keywordsRaw !== undefined
                        ? (selectedNode.data as any).config.keywordsRaw
                        : ((selectedNode.data as any).config?.keywords || []).join(', ')
                    }
                    onChange={(e) => {
                      const keywordsRaw = e.target.value;
                      const kw = keywordsRaw.split(',').map((k) => k.trim()).filter(Boolean);
                      handleUpdateSelectedNode({
                        config: { ...(selectedNode.data as any).config, keywords: kw, keywordsRaw }
                      });
                    }}
                    onBlur={() => {
                      const cfg = { ...(selectedNode.data as any).config };
                      delete cfg.keywordsRaw;
                      handleUpdateSelectedNode({ config: cfg });
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

        {/* Right Drawer: Connection / Edge Inspector */}
        {selectedEdge && !selectedNode && (
          <div className="w-80 md:w-96 shrink-0 bg-white border-l border-slate-200 z-20 flex flex-col h-full shadow-2xl animate-fade-in min-h-0 overflow-hidden">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-rose-600">
                  Connection Inspector
                </span>
                <h3 className="text-sm font-bold text-slate-900 truncate max-w-[210px]">
                  {selectedEdge.label ? String(selectedEdge.label) : 'Step Connection'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedEdge(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Close Inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-wider">From Source Step</span>
                  <span className="font-bold text-slate-800 text-sm block mt-0.5">
                    {String((nodes.find((n) => n.id === selectedEdge.source)?.data as any)?.name || selectedEdge.source)}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-wider">To Target Step</span>
                  <span className="font-bold text-slate-800 text-sm block mt-0.5">
                    {String((nodes.find((n) => n.id === selectedEdge.target)?.data as any)?.name || selectedEdge.target)}
                  </span>
                </div>
                {selectedEdge.label && (
                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-slate-400 text-[10px] block uppercase font-bold tracking-wider">Branch Condition</span>
                    <Badge variant="slate" className="mt-1 font-semibold text-slate-700 border-slate-300">
                      {String(selectedEdge.label)}
                    </Badge>
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-[11px] text-amber-900 space-y-1.5">
                <span className="font-bold flex items-center gap-1.5 text-amber-950">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                  3 Ways to Disconnect
                </span>
                <p>• Click the <strong>Disconnect</strong> button below.</p>
                <p>• Click the small <strong>×</strong> pill directly on the connector line.</p>
                <p>• Drag the arrow endpoint off the target node socket into empty space.</p>
              </div>
            </div>

            <div className="shrink-0 p-3 bg-slate-50 border-t border-slate-200 space-y-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEdges((eds) => eds.filter((e) => e.id !== selectedEdge.id));
                  setSelectedEdge(null);
                }}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300 font-semibold py-2 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Disconnect / Delete Connection
              </Button>
              <p className="text-[10px] text-center text-slate-400">
                You can immediately draw a new connection to any other node.
              </p>
            </div>
          </div>
        )}
      </div>

      <AIWorkflowGeneratorModal
        isOpen={isAIGeneratorOpen}
        onClose={() => setIsAIGeneratorOpen(false)}
        onWorkflowGenerated={handleApplyAIGeneratedWorkflow}
      />
    </div>
  );
};

