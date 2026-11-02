import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { User } from '../../src/models/user.model.js';
import { Contact } from '../../src/models/contact.model.js';
import { Workflow } from '../../src/models/workflow.model.js';
import { WorkflowExecution } from '../../src/models/workflow-execution.model.js';
import { Message } from '../../src/models/message.model.js';
import { WorkflowEngine } from '../../src/modules/workflows/workflow.engine.js';
import { VerificationService } from '../../src/modules/verification/verification.service.js';
import { executeApprovedTool } from '../../src/modules/ai-agent/ai-tools.js';
import { mockWhatsAppProvider } from '../../src/providers/messaging/mock-whatsapp.provider.js';

const app = createApp();

describe('External Verification & Integrations Tests (Phase 7)', () => {
  let managerToken: string;
  let agentToken: string;
  let managerUserId: string;
  let testContact: any;

  beforeEach(async () => {
    mockWhatsAppProvider.simulationDelayMs = 10;

    // 1. Create manager user
    const manager = await User.create({
      name: 'Manager Integration',
      email: `manager_${Date.now()}_${Math.random()}@company.com`,
      passwordHash: await User.hashPassword('StrongPassword123!'),
      role: 'manager'
    });
    managerUserId = manager._id.toString();

    const managerLogin = await request(app).post('/api/v1/auth/login').send({
      email: manager.email,
      password: 'StrongPassword123!'
    });
    managerToken = managerLogin.body.data.accessToken;

    // 2. Create agent user
    const agent = await User.create({
      name: 'Agent Integration',
      email: `agent_${Date.now()}_${Math.random()}@company.com`,
      passwordHash: await User.hashPassword('StrongPassword123!'),
      role: 'agent'
    });

    const agentLogin = await request(app).post('/api/v1/auth/login').send({
      email: agent.email,
      password: 'StrongPassword123!'
    });
    agentToken = agentLogin.body.data.accessToken;

    // 3. Create test contact
    testContact = await Contact.create({
      phone: '+919876543260',
      firstName: 'Ananya',
      lastName: 'Roy',
      customFields: { roleApplied: 'Data Analyst' },
      optInStatus: 'opted_in'
    });
  });

  describe('Integration Status & RBAC Endpoints', () => {
    it('should reject unauthenticated requests to integration endpoints', async () => {
      const res = await request(app).get('/api/v1/integrations/google-sheets/status');
      expect(res.status).toBe(401);
    });

    it('should reject agent role from accessing integration endpoints', async () => {
      const res = await request(app)
        .get('/api/v1/integrations/google-sheets/status')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(403);
    });

    it('should return Google Sheets integration status and test connection for manager', async () => {
      const statusRes = await request(app)
        .get('/api/v1/integrations/google-sheets/status')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.success).toBe(true);
      expect(statusRes.body.data.connected).toBe(true);
      expect(statusRes.body.data.provider).toBe('google_sheets');

      const testRes = await request(app)
        .post('/api/v1/integrations/google-sheets/test-connection')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(testRes.status).toBe(200);
      expect(testRes.body.success).toBe(true);
      expect(testRes.body.data.details.totalRowsDetected).toBeGreaterThan(0);
    });

    it('should return Microsoft Graph integration status and test connection for manager', async () => {
      const statusRes = await request(app)
        .get('/api/v1/integrations/microsoft-graph/status')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.success).toBe(true);
      expect(statusRes.body.data.connected).toBe(true);
      expect(statusRes.body.data.provider).toBe('microsoft_graph');

      const testRes = await request(app)
        .post('/api/v1/integrations/microsoft-graph/test-connection')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(testRes.status).toBe(200);
      expect(testRes.body.success).toBe(true);
      expect(testRes.body.data.details.workbookName).toContain('.xlsx');
    });
  });

  describe('Unified Verification Service & Redis Caching', () => {
    it('should verify candidate submission and cache result in Redis for subsequent calls', async () => {
      const surveyId = `SURV-REDIS-${Date.now()}`;

      // 1. First call: Cache miss (hits provider)
      const firstResult = await VerificationService.verifyCandidateSubmission({
        phone: testContact.phone,
        surveyId,
        providerName: 'mock'
      });

      expect(firstResult.verified).toBe(true);
      expect(firstResult.cached).toBe(false);

      // Contact should be auto-tagged with survey_verified
      const contactAfter = await Contact.findById(testContact._id);
      expect(contactAfter?.tags).toContain('survey_verified');

      // 2. Second call: Cache hit (served from Redis)
      const secondResult = await VerificationService.verifyCandidateSubmission({
        phone: testContact.phone,
        surveyId,
        providerName: 'mock'
      });

      expect(secondResult.verified).toBe(true);
      expect(secondResult.cached).toBe(true);
    });

    it('should correctly mark unverified when survey submission is missing or invalid', async () => {
      const result = await VerificationService.verifyCandidateSubmission({
        phone: testContact.phone,
        surveyId: 'invalid_survey_code',
        skipCache: true,
        providerName: 'mock'
      });

      expect(result.verified).toBe(false);
    });
  });

  describe('Workflow Engine verify_data Step Execution', () => {
    it('should execute verify_data step, branch to onSuccess when verified, and dispatch congratulations', async () => {
      // 1. Create a branching verification workflow
      const workflow = await Workflow.create({
        name: 'Survey Verification Flow',
        version: 1,
        isPublished: true,
        createdById: managerUserId,
        nodes: [
          {
            id: 'step_trigger',
            type: 'trigger',
            name: 'Start Trigger',
            config: {},
            nextStepId: 'step_verify'
          },
          {
            id: 'step_verify',
            type: 'verify_data',
            name: 'Verify Candidate Survey',
            config: {
              integrationType: 'mock',
              resultVariable: 'surveyVerified',
              onSuccessStepId: 'step_success',
              onFailureStepId: 'step_failure'
            }
          },
          {
            id: 'step_success',
            type: 'send_message',
            name: 'Send Verified Congratulations',
            config: {
              messageTemplate: 'Hi {{firstName}}, your survey has been verified! Welcome to the interview round.'
            },
            nextStepId: 'step_end_success'
          },
          {
            id: 'step_failure',
            type: 'send_message',
            name: 'Send Submission Missing Notice',
            config: {
              messageTemplate: 'Hi {{firstName}}, we could not find your survey submission. Please try again.'
            },
            nextStepId: 'step_end_fail'
          },
          {
            id: 'step_end_success',
            type: 'terminate',
            name: 'Completed Success',
            config: { outcome: 'completed' }
          },
          {
            id: 'step_end_fail',
            type: 'terminate',
            name: 'Completed Fail',
            config: { outcome: 'failed' }
          }
        ]
      });

      // 2. Start execution with a valid survey ID in runtime variables
      const execution = await WorkflowEngine.startExecution(
        workflow._id.toString(),
        testContact._id.toString(),
        undefined,
        { candidateSurveyId: 'SURV-FLOW-2026' }
      );

      const finalExec = await WorkflowExecution.findById(execution._id);
      expect(finalExec?.status).toBe('completed');
      expect(finalExec?.variables.surveyVerified).toBe(true);

      // Verify that the success message was sent
      const successMsg = await Message.findOne({
        contactId: testContact._id,
        direction: 'outbound',
        'content.body': { $regex: 'Welcome to the interview round' }
      });

      expect(successMsg).not.toBeNull();
      expect(successMsg?.content.body).toContain('Hi Ananya');

      // Verify contact was tagged
      const updatedContact = await Contact.findById(testContact._id);
      expect(updatedContact?.tags).toContain('survey_verified');
    });

    it('should branch to onFailureStepId when survey submission cannot be verified', async () => {
      const unverifiedContact = await Contact.create({
        phone: '+919876543261',
        firstName: 'Suresh',
        lastName: 'Menon',
        optInStatus: 'opted_in'
      });

      const workflow = await Workflow.create({
        name: 'Failure Branch Flow',
        version: 1,
        isPublished: true,
        createdById: managerUserId,
        nodes: [
          {
            id: 'step_trigger',
            type: 'trigger',
            name: 'Start',
            config: {},
            nextStepId: 'step_verify'
          },
          {
            id: 'step_verify',
            type: 'verify_data',
            name: 'Verify Survey',
            config: {
              integrationType: 'mock',
              resultVariable: 'surveyVerified',
              onSuccessStepId: 'step_success',
              onFailureStepId: 'step_failure'
            }
          },
          {
            id: 'step_success',
            type: 'send_message',
            name: 'Success Msg',
            config: { messageTemplate: 'Success' },
            nextStepId: 'step_end'
          },
          {
            id: 'step_failure',
            type: 'send_message',
            name: 'Fail Msg',
            config: { messageTemplate: 'Hi {{firstName}}, your survey is missing.' },
            nextStepId: 'step_end'
          },
          {
            id: 'step_end',
            type: 'terminate',
            name: 'End',
            config: { outcome: 'completed' }
          }
        ]
      });

      // Start execution with invalid survey ID
      const execution = await WorkflowEngine.startExecution(
        workflow._id.toString(),
        unverifiedContact._id.toString(),
        undefined,
        { candidateSurveyId: 'invalid_survey_id' }
      );

      const finalFailExec = await WorkflowExecution.findById(execution._id);
      expect(finalFailExec?.variables.surveyVerified).toBe(false);

      // Verify that the failure message was sent
      const failMsg = await Message.findOne({
        contactId: unverifiedContact._id,
        direction: 'outbound',
        'content.body': { $regex: 'your survey is missing' }
      });

      expect(failMsg).not.toBeNull();
      expect(failMsg?.content.body).toContain('Hi Suresh');
    });
  });

  describe('AI Agent Tool Unified Verification', () => {
    it('should verify survey completion through approved AI tool and cache response', async () => {
      const toolResult = await executeApprovedTool(
        'verify_survey_completion',
        { phone: testContact.phone, surveyId: 'SURV-AI-VERIFY-88' },
        { contactId: testContact._id.toString() }
      );

      expect(toolResult.success).toBe(true);
      expect(toolResult.data.verified).toBe(true);
      expect(toolResult.data.surveyId).toBe('SURV-AI-VERIFY-88');

      // Verify Contact tag was updated
      const contactAfter = await Contact.findById(testContact._id);
      expect(contactAfter?.tags).toContain('survey_verified');
    });
  });
});

