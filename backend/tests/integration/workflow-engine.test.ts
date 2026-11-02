import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { User } from '../../src/models/user.model.js';
import { Contact } from '../../src/models/contact.model.js';
import { Message } from '../../src/models/message.model.js';
import { Workflow } from '../../src/models/workflow.model.js';
import { WorkflowExecution } from '../../src/models/workflow-execution.model.js';
import { WorkflowEngine } from '../../src/modules/workflows/workflow.engine.js';
import { mockWhatsAppProvider } from '../../src/providers/messaging/mock-whatsapp.provider.js';

const app = createApp();

describe('Workflow Engine Core Integration Tests', () => {
  let managerToken: string;
  let rohitContact: any;
  let nehaContact: any;

  beforeEach(async () => {
    mockWhatsAppProvider.simulationDelayMs = 10;

    // 1. Create manager user
    const manager = await User.create({
      name: 'Manager Dave',
      email: `dave_${Date.now()}_${Math.random()}@company.com`,
      passwordHash: await User.hashPassword('StrongPassword123!'),
      role: 'manager'
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: manager.email,
      password: 'StrongPassword123!'
    });
    managerToken = loginRes.body.data.accessToken;

    // 2. Seed 2 contacts
    rohitContact = await Contact.create({
      phone: '+919876543220',
      firstName: 'Rohit',
      customFields: { roleApplied: 'Fullstack Dev' },
      optInStatus: 'opted_in'
    });

    nehaContact = await Contact.create({
      phone: '+919876543221',
      firstName: 'Neha',
      customFields: { roleApplied: 'UI Designer' },
      optInStatus: 'opted_in'
    });
  });

  it('should execute workflow with branching: YES routes to survey link, NO routes to opt-out', async () => {
    // 1. Create Workflow Definition via API
    const workflowPayload = {
      name: 'Recruitment Confirmation Workflow',
      description: 'Automated YES/NO branching with survey dispatch',
      nodes: [
        {
          id: 'step_trigger',
          type: 'trigger',
          name: 'Campaign Trigger',
          config: {},
          nextStepId: 'step_send_confirmation'
        },
        {
          id: 'step_send_confirmation',
          type: 'send_message',
          name: 'Send Confirmation Prompt',
          config: {
            messageTemplate: 'Hi {{firstName}}, are you interested in {{roleApplied}}? Reply YES or NO'
          },
          nextStepId: 'step_wait_reply'
        },
        {
          id: 'step_wait_reply',
          type: 'wait_for_reply',
          name: 'Wait for Candidate YES/NO',
          config: { timeoutMinutes: 1440 },
          branches: [
            {
              conditionType: 'regex',
              conditionValue: '^(yes|y|yeah)$',
              targetStepId: 'step_send_survey'
            },
            {
              conditionType: 'regex',
              conditionValue: '^(no|n|nope)$',
              targetStepId: 'step_opt_out'
            }
          ]
        },
        {
          id: 'step_send_survey',
          type: 'send_message',
          name: 'Send Survey Link',
          config: {
            messageTemplate: 'Great {{firstName}}! Here is your survey: https://company.com/s/101'
          },
          nextStepId: 'step_complete'
        },
        {
          id: 'step_opt_out',
          type: 'send_message',
          name: 'Send Opt-out Ack',
          config: {
            messageTemplate: 'Thank you {{firstName}}. We will keep your resume for future openings.'
          },
          nextStepId: 'step_complete'
        },
        {
          id: 'step_complete',
          type: 'terminate',
          name: 'Workflow Complete',
          config: { outcome: 'completed' }
        }
      ]
    };

    const createRes = await request(app)
      .post('/api/v1/workflows')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(workflowPayload);

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    const workflowId = createRes.body.data.id;
    expect(createRes.body.data.nodes.length).toBe(6);

    // 2. Publish Workflow
    const publishRes = await request(app)
      .post(`/api/v1/workflows/${workflowId}/publish`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(publishRes.status).toBe(200);
    expect(publishRes.body.data.isPublished).toBe(true);

    // 3. Start Execution for Rohit
    const rohitExecution = await WorkflowEngine.startExecution(
      workflowId,
      rohitContact._id.toString()
    );

    // Verify initial message sent and state waiting for reply
    const rohitUpdated = await WorkflowExecution.findById(rohitExecution._id);
    expect(rohitUpdated?.status).toBe('waiting_for_reply');
    expect(rohitUpdated?.currentStepId).toBe('step_wait_reply');

    const rohitConfirmMsg = await Message.findOne({
      contactId: rohitContact._id,
      direction: 'outbound'
    });
    expect(rohitConfirmMsg?.content.body).toBe(
      'Hi Rohit, are you interested in Fullstack Dev? Reply YES or NO'
    );

    // 4. Simulate Rohit replying "YES"
    await request(app).post('/api/v1/mock/whatsapp/incoming').send({
      fromPhone: rohitContact.phone,
      text: 'YES'
    });

    // Verify Rohit received survey message and workflow completed
    const rohitSurveyMsg = await Message.findOne({
      contactId: rohitContact._id,
      'content.body': 'Great Rohit! Here is your survey: https://company.com/s/101'
    });
    expect(rohitSurveyMsg).not.toBeNull();

    const rohitFinished = await WorkflowExecution.findById(rohitExecution._id);
    expect(rohitFinished?.status).toBe('completed');
    expect(rohitFinished?.currentStepId).toBe('step_complete');
    expect(rohitFinished?.variables.lastReply).toBe('YES');

    // 5. Start Execution for Neha
    const nehaExecution = await WorkflowEngine.startExecution(
      workflowId,
      nehaContact._id.toString()
    );

    const nehaUpdated = await WorkflowExecution.findById(nehaExecution._id);
    expect(nehaUpdated?.status).toBe('waiting_for_reply');

    // 6. Simulate Neha replying "NO"
    await request(app).post('/api/v1/mock/whatsapp/incoming').send({
      fromPhone: nehaContact.phone,
      text: 'NO'
    });

    // Verify Neha received opt-out message and workflow completed
    const nehaOptOutMsg = await Message.findOne({
      contactId: nehaContact._id,
      'content.body': 'Thank you Neha. We will keep your resume for future openings.'
    });
    expect(nehaOptOutMsg).not.toBeNull();

    const nehaFinished = await WorkflowExecution.findById(nehaExecution._id);
    expect(nehaFinished?.status).toBe('completed');
    expect(nehaFinished?.currentStepId).toBe('step_complete');
    expect(nehaFinished?.variables.lastReply).toBe('NO');

    // 7. Verify API listExecutions endpoint
    const executionsRes = await request(app)
      .get(`/api/v1/workflows/${workflowId}/executions`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(executionsRes.status).toBe(200);
    expect(executionsRes.body.data.length).toBe(2);
    expect(executionsRes.body.data.every((e: any) => e.status === 'completed')).toBe(true);
  });
});
