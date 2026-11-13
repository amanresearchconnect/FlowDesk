import React, { useState, useRef } from 'react';
import {
  Sparkles,
  UploadCloud,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Clock,
  Layers,
  ArrowRight,
  HelpCircle,
  RefreshCw
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { api } from '../../lib/api';

interface AIWorkflowGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkflowGenerated: (generatedData: {
    name: string;
    description: string;
    explanation: string;
    nodes: any[];
  }) => void;
}

const SAMPLE_SOP_GUIDE = `Sales Executive Interview & Screening Sequence
Step 1: Welcome candidate with interactive buttons:
"Hi {{firstName}}! Thanks for applying to the Sales Executive role at FlowDesk. Are you currently available for an interview this week?"
Buttons: [YES, Available], [Not Right Now]

Step 2: Decision Routing:
- If "Not Right Now": reply "No problem at all {{firstName}}, we will keep your resume on file." and finish flow.
- If "YES, Available": ask "Great! Please reply with your total sales experience (in years), current CTC, and notice period."

Step 3: AI Entity Extraction:
Extract experience, current CTC, and notice period from candidate reply.

Step 4: Sync to Google Sheet "Sales Candidates":
Upsert candidate row with Phone, Full Name, Experience, and Current CTC.

Step 5: Follow-Up Nudge:
If candidate doesn't reply within 8 hours, send a reminder: "Hi {{firstName}}, are you still interested in scheduling your interview?" with buttons [Confirm Interview], [Cancel Application].`;

export const AIWorkflowGeneratorModal: React.FC<AIWorkflowGeneratorModalProps> = ({
  isOpen,
  onClose,
  onWorkflowGenerated
}) => {
  const [mode, setMode] = useState<'upload' | 'text'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [textScript, setTextScript] = useState('');
  const [workflowName, setWorkflowName] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progressStage, setProgressStage] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
      setErrorMsg(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setErrorMsg(null);
    }
  };

  const handleLoadSample = () => {
    setMode('text');
    setTextScript(SAMPLE_SOP_GUIDE);
    setWorkflowName('Sales Executive Screening & Follow-Up');
    setErrorMsg(null);
  };

  const handleGenerate = async () => {
    setErrorMsg(null);

    if (mode === 'upload' && !selectedFile) {
      setErrorMsg('Please select a PDF, Word document (.docx), or text file to upload.');
      return;
    }

    if (mode === 'text' && textScript.trim().length < 20) {
      setErrorMsg('Please write or paste your recruitment script / workflow guidelines (at least 20 characters).');
      return;
    }

    setIsGenerating(true);
    setProgressStage('Uploading & extracting document text...');

    try {
      let res;
      if (mode === 'upload' && selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        if (customInstructions) formData.append('instructions', customInstructions);
        if (workflowName) formData.append('workflowName', workflowName);

        setProgressStage('AI analyzing stages, buttons, delay nudges, and Google Sheets...');
        res = await api.request('/workflows/generate-ai', {
          method: 'POST',
          body: formData
        });
      } else {
        setProgressStage('AI generating workflow DAG nodes & branch logic...');
        res = await api.request('/workflows/generate-ai', {
          method: 'POST',
          body: JSON.stringify({
            documentText: textScript,
            instructions: customInstructions,
            workflowName: workflowName || undefined
          })
        });
      }

      if (res && res.data) {
        setProgressStage('Rendering nodes on canvas...');
        onWorkflowGenerated(res.data);
        onClose();
      } else {
        throw new Error(res?.error || 'Failed to generate workflow');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred while generating workflow. Please check your document and try again.');
    } finally {
      setIsGenerating(false);
      setProgressStage('');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="✨ AI Workflow Builder from Document / Script"
      description="Upload an SOP guide (PDF / Word) or paste conversation instructions to automatically generate an end-to-end WhatsApp workflow."
      maxWidth="xl"
    >
      <div className="space-y-4 pt-1 text-slate-800 text-xs">
        {/* Cost & Info Banner */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-600 text-white shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-emerald-950 block text-[11px]">
                Zero Manual Wiring · 100% Accurate FlowDesk Nodes
              </span>
              <span className="text-[10px] text-emerald-700 block">
                Generates interactive buttons, decision branches, Google Sheet sync, and 8h/12h follow-up delays.
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-emerald-300 text-emerald-800 shrink-0">
            Cost: &lt; ₹0.10 / run
          </span>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setMode('upload'); setErrorMsg(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                mode === 'upload'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5" />
              Upload PDF / Word Doc
            </button>
            <button
              type="button"
              onClick={() => { setMode('text'); setErrorMsg(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                mode === 'text'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Paste Script / Guidelines
            </button>
          </div>

          <button
            type="button"
            onClick={handleLoadSample}
            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded border border-emerald-200 transition-colors flex items-center gap-1"
            title="Load a pre-written sales interview script to test immediately"
          >
            ⚡ Load Sample Script
          </button>
        </div>

        {/* Tab 1: Upload Dropzone */}
        {mode === 'upload' && (
          <div className="space-y-3">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                selectedFile
                  ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-400'
                  : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50/80'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt,.md"
                onChange={handleFileSelect}
                className="hidden"
              />

              {selectedFile ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <span className="font-bold text-slate-900 block text-xs truncate max-w-xs">
                      {selectedFile.name}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {(selectedFile.size / 1024).toFixed(1)} KB · Ready for AI processing
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                    className="p-1 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 ml-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-1">
                    <UploadCloud className="w-5 h-5 text-emerald-600" />
                  </div>
                  <p className="font-bold text-slate-800 text-xs">
                    Click to upload or drag & drop SOP / Guide
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Supports <strong>PDF (.pdf)</strong>, <strong>Word (.docx)</strong>, or <strong>Text (.txt)</strong> up to 15MB
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Text / Script Editor */}
        {mode === 'text' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span>Write or Paste Workflow Guidelines</span>
              <span className="text-[10px] text-slate-400 font-normal">
                {textScript.length} characters
              </span>
            </label>
            <textarea
              rows={6}
              value={textScript}
              onChange={(e) => { setTextScript(e.target.value); setErrorMsg(null); }}
              placeholder={`Step 1: Greet candidate with YES / NO buttons.\nStep 2: If YES, ask for experience and expected salary.\nStep 3: Save to Google Sheets.\nStep 4: If no reply in 8 hours, send a reminder nudge.`}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono leading-relaxed"
            />
          </div>
        )}

        {/* Additional Optional Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Workflow Title (Optional)
            </label>
            <input
              type="text"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              placeholder="e.g. Sales Executive Interview Flow"
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Custom Instructions / Preferences (Optional)
            </label>
            <input
              type="text"
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="e.g. Set reminder delay to 12 hours"
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Error Feedback */}
        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[10px] text-slate-500">
            {isGenerating ? (
              <span className="flex items-center gap-1.5 text-emerald-700 font-semibold animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {progressStage || 'Generating workflow with AI...'}
              </span>
            ) : (
              'Generated workflow opens directly on your canvas for inspection.'
            )}
          </span>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleGenerate}
              isLoading={isGenerating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-bold flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Generate Workflow</span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

