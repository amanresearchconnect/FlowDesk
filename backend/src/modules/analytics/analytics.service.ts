import mongoose, { Types } from 'mongoose';
import { Campaign, ICampaignDocument } from '../../models/campaign.model.js';
import { Message } from '../../models/message.model.js';
import { WorkflowExecution } from '../../models/workflow-execution.model.js';
import { Workflow } from '../../models/workflow.model.js';
import { Contact } from '../../models/contact.model.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export interface OverviewMetrics {
  totalCampaigns: number;
  totalAudience: number;
  dispatched: number;
  delivered: number;
  read: number;
  replied: number;
  startedWorkflow: number;
  completedGoal: number;
  humanEscalated: number;
  deliveryRate: number;
  readRate: number;
  replyRate: number;
  goalCompletionRate: number;
  humanHandoffRate: number;
}

export interface FunnelStage {
  stage: string;
  count: number;
  percentageOfTop: number;
  dropOffCount: number;
  dropOffRate: number;
  description: string;
}

export interface WorkflowStepDropOff {
  stepId: string;
  stepName: string;
  stepType: string;
  promptPreview: string;
  contactsReached: number;
  contactsCompleted: number;
  contactsDroppedHere: number;
  dropOffRate: number;
  isHighAbandonment: boolean;
}

export interface CampaignRecipientDetail {
  id: string;
  name: string;
  phone: string;
  email: string;
  delivered: boolean;
  read: boolean;
  replied: boolean;
  transferredToHuman: boolean;
  completedWorkflow: boolean;
  status: 'completed' | 'in_progress' | 'transferred' | 'opt_out' | 'delivered' | 'sent';
  lastActivityAt?: Date;
}

export class AnalyticsService {
  /**
   * Recalculates and updates campaign stats using unique contact-level aggregation.
   * Completely eliminates duplicate increments and caps rates between 0% and 100%.
   */
  public static async recalculateCampaignStats(targetCampaignId?: string): Promise<{ updatedCount: number }> {
    const filter: any = {};
    if (targetCampaignId) {
      if (!mongoose.isValidObjectId(targetCampaignId)) {
        throw new ValidationError('Invalid campaign ID');
      }
      filter._id = new Types.ObjectId(targetCampaignId);
    }

    const campaigns = await Campaign.find(filter);
    let updatedCount = 0;

    for (const campaign of campaigns) {
      const campId = campaign._id;

      // 1. Aggregate distinct contacts from messages
      const msgStats = await Message.aggregate([
        { $match: { campaignId: campId } },
        {
          $group: {
            _id: '$contactId',
            hasOutbound: { $max: { $cond: [{ $eq: ['$direction', 'outbound'] }, 1, 0] } },
            hasDelivered: { $max: { $cond: [{ $in: ['$status', ['delivered', 'read']] }, 1, 0] } },
            hasRead: { $max: { $cond: [{ $eq: ['$status', 'read'] }, 1, 0] } },
            hasInbound: { $max: { $cond: [{ $eq: ['$direction', 'inbound'] }, 1, 0] } }
          }
        },
        {
          $group: {
            _id: null,
            dispatched: { $sum: '$hasOutbound' },
            delivered: { $sum: '$hasDelivered' },
            read: { $sum: '$hasRead' },
            replied: { $sum: '$hasInbound' }
          }
        }
      ]);

      const distinctMsg = msgStats[0] || { dispatched: 0, delivered: 0, read: 0, replied: 0 };

      // 2. Aggregate distinct contacts from workflow executions
      const execStats = await WorkflowExecution.aggregate([
        { $match: { campaignId: campId } },
        {
          $group: {
            _id: '$contactId',
            isStarted: { $max: 1 },
            isCompleted: { $max: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
            isEscalated: {
              $max: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$status', 'paused_for_human'] },
                      { $in: ['human_escalation', '$stepLogs.stepType'] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $group: {
            _id: null,
            started: { $sum: '$isStarted' },
            completed: { $sum: '$isCompleted' },
            escalated: { $sum: '$isEscalated' }
          }
        }
      ]);

      const distinctExec = execStats[0] || { started: 0, completed: 0, escalated: 0 };

      // Determine clean, non-zero audience count
      let totalAudience = campaign.stats?.totalContacts || 0;
      if (totalAudience < distinctMsg.dispatched) {
        totalAudience = distinctMsg.dispatched;
      }
      if (totalAudience === 0) {
        totalAudience = Math.max(distinctMsg.dispatched, 1);
      }

      // Mathematical boundary guarantees: no step can exceed unique audience or previous stage
      const cleanDispatched = Math.min(totalAudience, distinctMsg.dispatched);
      const cleanDelivered = Math.min(cleanDispatched, distinctMsg.delivered);
      const cleanRead = Math.min(cleanDelivered, distinctMsg.read);
      const cleanReplied = Math.min(cleanDelivered, distinctMsg.replied);
      const cleanStarted = Math.min(cleanDispatched, distinctExec.started);
      const cleanCompleted = Math.min(cleanDispatched, distinctExec.completed);
      const cleanEscalated = Math.min(cleanDispatched, distinctExec.escalated);

      campaign.stats = {
        totalContacts: totalAudience,
        dispatched: cleanDispatched,
        delivered: cleanDelivered,
        read: cleanRead,
        replied: cleanReplied,
        failed: campaign.stats?.failed || 0,
        startedWorkflow: cleanStarted,
        completedGoal: cleanCompleted,
        humanEscalated: cleanEscalated
      };

      await campaign.save();
      updatedCount++;
    }

    logger.info('Recalculated campaign stats successfully with unique contact deduplication', { updatedCount });
    return { updatedCount };
  }

  /**
   * Retrieves high-level executive metrics for a specific campaign or all campaigns.
   * Rates are mathematically guaranteed to stay strictly between 0% and 100%.
   */
  public static async getOverviewMetrics(campaignId?: string, timeRange?: string): Promise<OverviewMetrics> {
    try {
      await this.recalculateCampaignStats(campaignId && campaignId !== 'all' ? campaignId : undefined);
    } catch (e) {
      logger.warn('Recalculation during overview fetch encountered non-fatal error', { error: e });
    }

    const filter: any = {};
    if (campaignId && campaignId !== 'all') {
      if (!mongoose.isValidObjectId(campaignId)) {
        throw new ValidationError('Invalid campaign ID');
      }
      filter._id = new Types.ObjectId(campaignId);
    }

    if (timeRange && timeRange !== 'all') {
      const now = new Date();
      if (timeRange === '7d') {
        filter.createdAt = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
      } else if (timeRange === '30d') {
        filter.createdAt = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
      }
    }

    const campaigns = await Campaign.find(filter);

    const totalCampaigns = campaigns.length;
    let totalAudience = 0;
    let dispatched = 0;
    let delivered = 0;
    let read = 0;
    let replied = 0;
    let startedWorkflow = 0;
    let completedGoal = 0;
    let humanEscalated = 0;

    for (const c of campaigns) {
      totalAudience += c.stats?.totalContacts || 0;
      dispatched += c.stats?.dispatched || 0;
      delivered += c.stats?.delivered || 0;
      read += c.stats?.read || 0;
      replied += c.stats?.replied || 0;
      startedWorkflow += c.stats?.startedWorkflow || 0;
      completedGoal += c.stats?.completedGoal || 0;
      humanEscalated += c.stats?.humanEscalated || 0;
    }

    if (totalAudience < dispatched) totalAudience = dispatched;

    // Strict boundary enforcement to prevent any rate exceeding 100%
    delivered = Math.min(dispatched, delivered);
    read = Math.min(delivered, read);
    replied = Math.min(delivered, replied);
    completedGoal = Math.min(dispatched, completedGoal);
    humanEscalated = Math.min(dispatched, humanEscalated);

    const deliveryRate = dispatched > 0 ? Math.min(100, Math.round((delivered / dispatched) * 100)) : 0;
    const readRate = delivered > 0 ? Math.min(100, Math.round((read / delivered) * 100)) : 0;
    const replyRate = delivered > 0 ? Math.min(100, Math.round((replied / delivered) * 100)) : 0;
    const goalCompletionRate = dispatched > 0 ? Math.min(100, Math.round((completedGoal / dispatched) * 100)) : 0;
    const humanHandoffRate = dispatched > 0 ? Math.min(100, Math.round((humanEscalated / dispatched) * 100)) : 0;

    return {
      totalCampaigns,
      totalAudience,
      dispatched,
      delivered,
      read,
      replied,
      startedWorkflow,
      completedGoal,
      humanEscalated,
      deliveryRate,
      readRate,
      replyRate,
      goalCompletionRate,
      humanHandoffRate
    };
  }

  /**
   * Retrieves conversion funnel stages focusing on core progression
   */
  public static async getFunnel(campaignId?: string): Promise<{ stages: FunnelStage[] }> {
    const metrics = await this.getOverviewMetrics(campaignId);

    const baseCount = metrics.totalAudience > 0 ? metrics.totalAudience : (metrics.dispatched > 0 ? metrics.dispatched : 1);

    const rawStages = [
      {
        stage: 'Dispatched to Audience',
        count: metrics.dispatched,
        description: 'Candidate messages transmitted via WhatsApp'
      },
      {
        stage: 'Messages Delivered',
        count: metrics.delivered,
        description: 'Confirmed received on candidate handsets'
      },
      {
        stage: 'Messages Read',
        count: metrics.read,
        description: 'Read receipts confirmed by recipient'
      },
      {
        stage: 'Sent Reply',
        count: metrics.replied,
        description: 'Candidates who responded or sent answers'
      },
      {
        stage: 'Transferred to Human',
        count: metrics.humanEscalated,
        description: 'Conversations escalated for live human support'
      },
      {
        stage: 'Completed Whole Workflow',
        count: metrics.completedGoal,
        description: 'Candidates who finished the complete screening DAG'
      }
    ];

    const stages: FunnelStage[] = [];

    for (let i = 0; i < rawStages.length; i++) {
      const cur = rawStages[i];
      const next = rawStages[i + 1];

      const percentageOfTop = baseCount > 0 ? Math.min(100, Math.round((cur.count / baseCount) * 100)) : 0;

      let dropOffCount = 0;
      let dropOffRate = 0;

      if (next && cur.count >= next.count) {
        dropOffCount = Math.max(0, cur.count - next.count);
        dropOffRate = cur.count > 0 ? Math.min(100, Math.round((dropOffCount / cur.count) * 100)) : 0;
      }

      stages.push({
        stage: cur.stage,
        count: cur.count,
        percentageOfTop,
        dropOffCount,
        dropOffRate,
        description: cur.description
      });
    }

    return { stages };
  }

  /**
   * Returns granular recipient-level status records for transparency
   */
  public static async getCampaignRecipients(campaignId?: string): Promise<CampaignRecipientDetail[]> {
    const filter: any = {};
    if (campaignId && campaignId !== 'all') {
      if (!mongoose.isValidObjectId(campaignId)) {
        throw new ValidationError('Invalid campaign ID');
      }
      filter.campaignId = new Types.ObjectId(campaignId);
    }

    const msgContactIds = await Message.distinct('contactId', filter);
    const execContactIds = await WorkflowExecution.distinct('contactId', filter);

    const allContactIds = Array.from(
      new Set([...msgContactIds.map((id: any) => id.toString()), ...execContactIds.map((id: any) => id.toString())])
    )
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new Types.ObjectId(id));

    if (allContactIds.length === 0) {
      return [];
    }

    const contacts = await Contact.find({ _id: { $in: allContactIds } });
    const contactMap = new Map(contacts.map((c) => [c._id.toString(), c]));

    const recipientList: CampaignRecipientDetail[] = [];

    for (const contactId of allContactIds) {
      const cStr = contactId.toString();
      const contact = contactMap.get(cStr);
      if (!contact) continue;

      const contactMsgFilter: any = { contactId, ...filter };
      const messages = await Message.find(contactMsgFilter).sort({ createdAt: -1 });

      const executions = await WorkflowExecution.find({ contactId, ...filter }).sort({ createdAt: -1 });

      const hasDelivered = messages.some((m) => m.direction === 'outbound' && ['delivered', 'read'].includes(m.status));
      const hasRead = messages.some((m) => m.direction === 'outbound' && m.status === 'read');
      const hasReplied = messages.some((m) => m.direction === 'inbound');

      const isCompleted = executions.some((e) => e.status === 'completed');
      const isEscalated = executions.some(
        (e) => e.status === 'paused_for_human' || e.stepLogs?.some((l: any) => l.stepType === 'human_escalation')
      );

      let status: CampaignRecipientDetail['status'] = 'sent';
      if (isCompleted) {
        status = 'completed';
      } else if (isEscalated) {
        status = 'transferred';
      } else if (hasReplied) {
        status = 'in_progress';
      } else if (hasDelivered) {
        status = 'delivered';
      }

      const lastActivity = messages[0]?.createdAt || executions[0]?.updatedAt || contact.updatedAt;

      recipientList.push({
        id: cStr,
        name: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Candidate',
        phone: contact.phone,
        email: contact.email || '—',
        delivered: hasDelivered,
        read: hasRead,
        replied: hasReplied,
        transferredToHuman: isEscalated,
        completedWorkflow: isCompleted,
        status,
        lastActivityAt: lastActivity
      });
    }

    return recipientList;
  }

  /**
   * Analyzes workflow execution step drop-offs for a specific campaign
   */
  public static async getWorkflowStepDropOff(campaignId: string): Promise<{
    hasWorkflow: boolean;
    workflowName?: string;
    totalEnrolled: number;
    steps: WorkflowStepDropOff[];
  }> {
    if (!mongoose.isValidObjectId(campaignId)) {
      throw new ValidationError('Invalid campaign ID format');
    }

    const campaign = await Campaign.findById(campaignId).populate('workflowId');
    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    if (!campaign.workflowId) {
      return {
        hasWorkflow: false,
        totalEnrolled: campaign.stats?.dispatched || 0,
        steps: []
      };
    }

    const workflow = (campaign.workflowId as any) as {
      _id: Types.ObjectId;
      name: string;
      nodes: Array<{
        id: string;
        type: string;
        name?: string;
        config?: any;
        nextStepId?: string;
      }>;
    };

    const executions = await WorkflowExecution.find({
      campaignId: campaign._id
    });

    const totalEnrolled = executions.length;
    if (totalEnrolled === 0 || !workflow.nodes || workflow.nodes.length === 0) {
      return {
        hasWorkflow: true,
        workflowName: workflow.name,
        totalEnrolled,
        steps: []
      };
    }

    // Map each node and count visits & completions
    const steps: WorkflowStepDropOff[] = [];

    // Filter relevant user-interactive or meaningful milestone nodes
    const displayableNodes = workflow.nodes.filter(
      (n) => n.type !== 'start'
    );

    let previousReached = totalEnrolled;

    for (const node of displayableNodes) {
      const reachedCount = executions.filter((e) =>
        e.stepLogs && e.stepLogs.some((l) => l.stepId === node.id)
      ).length;

      const completedCount = executions.filter((e) =>
        e.stepLogs && e.stepLogs.some((l) => l.stepId === node.id && l.status === 'completed')
      ).length;

      const droppedCount = executions.filter(
        (e) => e.currentStepId === node.id && (e.status === 'waiting_for_reply' || e.status === 'failed')
      ).length;

      const dropOffRate = previousReached > 0 ? Math.round(((previousReached - reachedCount) / previousReached) * 100) : 0;
      const isHighAbandonment = dropOffRate >= 25 || droppedCount > 0;

      let promptPreview = '';
      if (node.config?.messageBody) promptPreview = String(node.config.messageBody).substring(0, 100);
      else if (node.config?.text) promptPreview = String(node.config.text).substring(0, 100);
      else if (node.config?.body) promptPreview = String(node.config.body).substring(0, 100);
      else if (node.config?.message) promptPreview = String(node.config.message).substring(0, 100);
      else if (node.config?.prompt) promptPreview = String(node.config.prompt).substring(0, 100);
      else if (node.config?.question) promptPreview = String(node.config.question).substring(0, 100);
      else if (node.config?.outcome) promptPreview = `Outcome: ${node.config.outcome}`;

      steps.push({
        stepId: node.id,
        stepName: node.name || node.config?.label || `${node.type.toUpperCase()} Step`,
        stepType: node.type,
        promptPreview,
        contactsReached: reachedCount,
        contactsCompleted: completedCount,
        contactsDroppedHere: droppedCount,
        dropOffRate: Math.max(0, dropOffRate),
        isHighAbandonment
      });

      if (reachedCount > 0) {
        previousReached = reachedCount;
      }
    }

    return {
      hasWorkflow: true,
      workflowName: workflow.name,
      totalEnrolled,
      steps
    };
  }
}

