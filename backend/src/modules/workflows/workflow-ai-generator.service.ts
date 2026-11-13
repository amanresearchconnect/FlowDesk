import { getAIProvider } from '../../providers/ai/ai.factory.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';

export interface WorkflowNodeBlueprint {
  id: string;
  name: string;
  type:
    | 'trigger'
    | 'send_message'
    | 'send_text_message'
    | 'condition'
    | 'delay'
    | 'verify_data'
    | 'append_to_sheet'
    | 'update_record'
    | 'ai_parse'
    | 'ai_conversation'
    | 'human_handoff'
    | 'terminate';
  config: Record<string, any>;
  nextStepId?: string | null;
  branches?: Array<{
    conditionType: 'equals' | 'regex' | 'contains' | 'default';
    conditionValue?: string | null;
    targetStepId: string;
  }>;
}

export interface GeneratedWorkflowResult {
  name: string;
  description: string;
  explanation: string;
  nodes: WorkflowNodeBlueprint[];
}

export class WorkflowAIGeneratorService {
  /**
   * Extracts text from uploaded files (PDF, DOCX, TXT, MD)
   */
  public static async extractTextFromFile(file: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
  }): Promise<string> {
    const filename = file.originalname.toLowerCase();

    // 1. PDF Parser
    if (file.mimetype === 'application/pdf' || filename.endsWith('.pdf')) {
      try {
        const pdfMod: any = await import('pdf-parse');
        const PDFParse = pdfMod.PDFParse || pdfMod.default?.PDFParse || pdfMod.default;
        if (typeof PDFParse === 'function') {
          const parser = new PDFParse(file.buffer);
          if (typeof parser.load === 'function') await parser.load();
          const res = typeof parser.getText === 'function' ? await parser.getText() : null;
          if (res) {
            const extracted = typeof res === 'string' ? res : res.text || '';
            if (extracted.trim().length > 10) return extracted.trim();
          }
        }
      } catch (err: any) {
        logger.warn('PDFParse failed, falling back to text buffer conversion', { error: err.message });
      }
    }

    // 2. Microsoft Word DOCX Parser
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      filename.endsWith('.docx') ||
      filename.endsWith('.doc')
    ) {
      try {
        const mammoth: any = await import('mammoth');
        const extractFn = mammoth.extractRawText || mammoth.default?.extractRawText;
        if (typeof extractFn === 'function') {
          const result = await extractFn({ buffer: file.buffer });
          if (result && result.value && result.value.trim().length > 10) {
            return result.value.trim();
          }
        }
      } catch (err: any) {
        logger.warn('Mammoth docx parse failed', { error: err.message });
      }
    }

    // 3. Fallback to UTF-8 text decoding
    return file.buffer.toString('utf-8').trim();
  }

  /**
   * Generates a complete, verified, auto-laid-out FlowDesk workflow using AI
   */
  public static async generateWorkflowFromText(params: {
    documentText: string;
    instructions?: string;
    workflowName?: string;
  }): Promise<GeneratedWorkflowResult> {
    const { documentText, instructions, workflowName } = params;

    if (!documentText || documentText.trim().length < 5) {
      throw new AppError('Provided document or text is too short to generate a workflow', 400);
    }

    const systemPrompt = `You are FlowDesk's Master Workflow Architect.
Your task is to analyze user-provided recruitment/business guidelines, scripts, SOPs, or natural language prompts and generate a complete, valid, executable FlowDesk DAG workflow.

CRITICAL ARCHITECTURE RULES & NODE TYPES:
1. "trigger": Entry point for the workflow.
   - id: "step_1_trigger"
   - name: "Inbound Keyword Trigger"
   - type: "trigger"
   - config: { keywords: ["APPLY", "HI"], channel: "whatsapp" }
   - nextStepId: "<next step id>"

2. "send_message": WhatsApp message with or without interactive quick-reply buttons.
   - type: "send_message"
   - config: {
       messageTemplate: "Hello {{firstName}}! Thanks for applying for {{role}} at {{company}}. Are you available for an interview this week?", // Supports {{firstName}}, {{company}}, {{role}}
       buttons: [{ id: "btn_yes", title: "YES, Available" }, { id: "btn_no", title: "Not Available" }], // Max 3 buttons, max 20 chars per title. If purely text acknowledgment, use buttons: []
       waitForReply: true // Set to true if waiting for user's response or button tap before advancing
     }
   - nextStepId: "<next step id>"

3. "condition": Decision branch router following a button tap or reply.
   - type: "condition"
   - name: "Evaluate Candidate Reply"
   - config: { variablePath: "lastReply" }
   - branches: [
       { conditionType: "equals", conditionValue: "YES, Available, Interested", targetStepId: "step_..." },
       { conditionType: "equals", conditionValue: "NO, Not Available", targetStepId: "step_..." }
     ]
   - (condition nodes do NOT use nextStepId; routing is done via branches array!)

4. "delay": Timed follow-up & automated reminder (nudge).
   - type: "delay"
   - name: "Wait & Follow-Up Reminder"
   - config: {
       delayValue: 8, // numeric duration
       delayUnit: "hours", // "minutes" | "hours" | "days"
       messageTemplate: "Good morning {{firstName}}, reminder for your interview today! Are you on your way?",
       buttons: [{ id: "btn_yes", title: "Yes, On My Way" }, { id: "btn_reschedule", title: "Need to Reschedule" }],
       cancelOnReply: true, // Auto-cancel nudge if candidate replies before timer expires
       waitForReply: true
     }
   - nextStepId: "<next step id>"

5. "ai_parse": Multilingual Entity & Form Extractor.
   - Use when the candidate replies with multi-item details (e.g. experience, current salary, expected salary, notice period, location).
   - type: "ai_parse"
   - name: "AI Entity & Form Extractor"
   - config: {
       sourceVariable: "lastReply",
       fields: [
         { name: "experience", description: "Years of work experience" },
         { name: "current CTC", description: "Current annual salary" },
         { name: "expected CTC", description: "Expected annual salary" },
         { name: "notice period", description: "Notice period in days or months" }
       ]
     }
   - nextStepId: "<next step id>"

6. "append_to_sheet": Google Sheets / Excel write & smart upsert.
   - type: "append_to_sheet"
   - name: "Sync to Google Sheets"
   - config: {
       sheetName: "Responses",
       mode: "upsert",
       lookupKey: "phone",
       columnMappings: [
         { sheetColumn: "Candidate Phone", value: "{{phone}}" },
         { sheetColumn: "Full Name", value: "{{firstName}} {{lastName}}" },
         { sheetColumn: "Experience", value: "{{experience}}" },
         { sheetColumn: "Expected Salary", value: "{{expected CTC}}" }
       ]
     }
   - nextStepId: "<next step id>"

7. "update_record": Add tags or variables to candidate profile.
   - type: "update_record"
   - name: "Tag Contact"
   - config: { operations: [{ action: "add_tag", value: "interview_scheduled" }] }
   - nextStepId: "<next step id>"

8. "human_handoff": Escalate to recruiter team inbox.
   - type: "human_handoff"
   - name: "Escalate to Recruiter"
   - config: { reason: "Candidate requested human recruiter" }
   - nextStepId: "<next step id>"

9. "terminate": Marks the workflow as completed.
   - type: "terminate"
   - name: "Screening Completed"
   - config: { reason: "Finished" }

CONNECTION INTEGRITY RULES:
- Every node MUST have a non-empty, clear "name" (e.g. "Candidate Greeting", "Evaluate YES/NO").
- Every node MUST have a unique "id" (e.g. "step_1_trigger", "step_2_greeting", "step_3_check").
- Every single-path step must point to the next logical step ID via "nextStepId".
- Every branch in a "condition" node MUST point to a valid node ID in the "targetStepId" field.
- The workflow must start with a "trigger" node.
- Terminal nodes must be of type "terminate" or have no nextStepId.
- NEVER invent node types outside the 9 types listed above.

Output strictly valid JSON with no markdown prose outside the JSON:
{
  "name": "Concise Descriptive Workflow Name",
  "description": "Short explanation of what this workflow accomplishes",
  "explanation": "Clear summary of the steps created, interactive buttons, and logic rules",
  "nodes": [ ... ]
}`;

    const userPrompt = `DOCUMENT / SCRIPT / GUIDELINES:
"""
${documentText.substring(0, 15000)}
"""

ADDITIONAL CUSTOM INSTRUCTIONS / PREFERENCES:
"""
${instructions || 'Create an automated, conversion-optimized WhatsApp recruitment/screening workflow following standard best practices with interactive buttons, appropriate branches, and follow-up reminders.'}
"""

${workflowName ? `WORKFLOW TITLE: "${workflowName}"` : ''}

Generate the complete FlowDesk workflow JSON now.`;

    const aiProvider = getAIProvider();
    const response = await aiProvider.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    });

    const rawContent = (response.content || '').trim();
    if (!rawContent) {
      throw new AppError('AI provider returned an empty response', 502);
    }

    const cleanJson = rawContent
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (parseErr: any) {
      logger.error('Failed to parse AI workflow generator JSON output', {
        error: parseErr.message,
        rawContent
      });
      throw new AppError('Failed to parse generated workflow from AI. Please try again.', 502);
    }

    if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
      throw new AppError('Generated workflow contains no nodes', 502);
    }

    // Run Auto-Healing & Validation Gate
    const healedNodes = this.healAndLayoutNodes(parsed.nodes);

    return {
      name: parsed.name || workflowName || 'AI Generated Recruitment Flow',
      description: parsed.description || 'Automated multi-step WhatsApp workflow generated by FlowDesk AI.',
      explanation: parsed.explanation || 'Workflow successfully assembled from your document.',
      nodes: healedNodes
    };
  }

  /**
   * Heals broken connections and computes clean, non-overlapping (x, y) visual coordinates
   */
  private static healAndLayoutNodes(nodes: WorkflowNodeBlueprint[]): WorkflowNodeBlueprint[] {
    const nodeMap = new Map<string, WorkflowNodeBlueprint>();
    const nodeIds = new Set<string>();

    // 1. Sanitize IDs and names
    nodes.forEach((n, idx) => {
      if (!n.id) n.id = `step_${idx + 1}_${n.type || 'action'}`;
      if (!n.name) {
        n.name = n.type
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
      }
      if (!n.config) n.config = {};
      nodeIds.add(n.id);
      nodeMap.set(n.id, n);
    });

    // 2. Validate and auto-heal connections
    nodes.forEach((n, idx) => {
      // Heal nextStepId
      if (n.nextStepId && !nodeIds.has(n.nextStepId)) {
        // Point to next adjacent node if available
        n.nextStepId = nodes[idx + 1] ? nodes[idx + 1].id : null;
      }

      // Heal condition branches
      if (n.type === 'condition' && Array.isArray(n.branches)) {
        n.branches.forEach((b) => {
          if (!nodeIds.has(b.targetStepId)) {
            // Find a valid downstream node
            const candidate = nodes.slice(idx + 1).find((cand) => cand.id !== n.id);
            b.targetStepId = candidate ? candidate.id : '';
          }
        });
      }
    });

    // 3. Auto-Layout Visual Tree Coordinates
    const DEFAULT_X = 260;
    const Y_SPACING = 160;

    // Track level/depth for each node
    const depths = new Map<string, number>();
    const triggerNode = nodes.find((n) => n.type === 'trigger') || nodes[0];
    depths.set(triggerNode.id, 0);

    // BFS or linear traversal to compute depths
    const queue = [triggerNode.id];
    const visited = new Set<string>([triggerNode.id]);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentDepth = depths.get(currentId) || 0;
      const node = nodeMap.get(currentId);

      if (node) {
        if (node.nextStepId && !visited.has(node.nextStepId)) {
          depths.set(node.nextStepId, currentDepth + 1);
          visited.add(node.nextStepId);
          queue.push(node.nextStepId);
        }

        if (node.branches && Array.isArray(node.branches)) {
          node.branches.forEach((b) => {
            if (b.targetStepId && !visited.has(b.targetStepId)) {
              depths.set(b.targetStepId, currentDepth + 1);
              visited.add(b.targetStepId);
              queue.push(b.targetStepId);
            }
          });
        }
      }
    }

    // For any unvisited nodes, assign incremental depth
    let fallbackDepth = 1;
    nodes.forEach((n) => {
      if (!depths.has(n.id)) {
        depths.set(n.id, fallbackDepth++);
      }
    });

    // Group nodes by depth level to space them out horizontally
    const levelGroups = new Map<number, WorkflowNodeBlueprint[]>();
    nodes.forEach((n) => {
      const d = depths.get(n.id) || 0;
      if (!levelGroups.has(d)) levelGroups.set(d, []);
      levelGroups.get(d)!.push(n);
    });

    // Assign final (x, y) coordinates
    levelGroups.forEach((levelNodes, depth) => {
      const y = 30 + depth * Y_SPACING;
      const count = levelNodes.length;

      if (count === 1) {
        levelNodes[0].config._position = { x: DEFAULT_X, y };
      } else {
        // Multi-branch horizontal split
        const totalWidth = (count - 1) * 320;
        const startX = DEFAULT_X - totalWidth / 2;
        levelNodes.forEach((n, i) => {
          n.config._position = { x: Math.round(startX + i * 320), y };
        });
      }
    });

    return nodes;
  }
}

