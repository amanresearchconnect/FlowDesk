import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { User } from '../../src/models/user.model.js';
import { Contact } from '../../src/models/contact.model.js';
import { Conversation } from '../../src/models/conversation.model.js';
import { Message } from '../../src/models/message.model.js';
import { KnowledgeArticle } from '../../src/models/knowledge-base.model.js';
import { executeApprovedTool } from '../../src/modules/ai-agent/ai-tools.js';
import { mockWhatsAppProvider } from '../../src/providers/messaging/mock-whatsapp.provider.js';

const app = createApp();

describe('AI Agent Engine & Knowledge Base Integration Tests', () => {
  let managerToken: string;
  let agentToken: string;
  let managerUserId: string;
  let testContact: any;

  beforeEach(async () => {
    mockWhatsAppProvider.simulationDelayMs = 10;

    // 1. Create manager user
    const manager = await User.create({
      name: 'Manager Alice',
      email: `alice_${Date.now()}_${Math.random()}@company.com`,
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
      name: 'Agent Bob',
      email: `bob_${Date.now()}_${Math.random()}@company.com`,
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
      phone: '+919876543250',
      firstName: 'Vikram',
      lastName: 'Singhania',
      customFields: { roleApplied: 'Backend Engineer' },
      optInStatus: 'opted_in'
    });
  });

  describe('Knowledge Base API & RBAC', () => {
    it('should reject unauthenticated requests to knowledge base endpoints', async () => {
      const res = await request(app).get('/api/v1/knowledge-base');
      expect(res.status).toBe(401);
    });

    it('should reject agent role from creating or modifying knowledge base articles', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge-base')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          category: 'recruitment',
          title: 'Remote Work Policy',
          content: 'We offer flexible hybrid work with 2 days remote weekly.',
          keywords: ['remote', 'hybrid', 'policy']
        });

      expect(res.status).toBe(403);
    });

    it('should allow manager to create, retrieve, update, and search knowledge base articles', async () => {
      // 1. Create article
      const createRes = await request(app)
        .post('/api/v1/knowledge-base')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          category: 'recruitment',
          title: 'Working Hours and Benefits',
          content: 'Standard working hours are 9:00 AM to 6:00 PM IST with comprehensive health insurance and lunch provided.',
          keywords: ['hours', 'benefits', 'insurance', 'timing']
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.success).toBe(true);
      const articleId = createRes.body.data.id;
      expect(articleId).toBeDefined();

      // 2. List articles with search query
      const searchRes = await request(app)
        .get('/api/v1/knowledge-base')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ search: 'insurance', category: 'recruitment' });

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(searchRes.body.data[0].title).toBe('Working Hours and Benefits');

      // 3. Update article
      const updateRes = await request(app)
        .put(`/api/v1/knowledge-base/${articleId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Working Hours, Shift Timings and Health Insurance'
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.title).toContain('Shift Timings');
      expect(updateRes.body.data.version).toBe(2);

      // 4. Delete article
      const deleteRes = await request(app)
        .delete(`/api/v1/knowledge-base/${articleId}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);
    });
  });

  describe('Approved AI Tools Sandbox Execution', () => {
    it('should execute get_candidate_status tool and return contact profile', async () => {
      const result = await executeApprovedTool(
        'get_candidate_status',
        { phone: testContact.phone },
        { contactId: testContact._id.toString() }
      );

      expect(result.success).toBe(true);
      expect(result.data.found).toBe(true);
      expect(result.data.phone).toBe(testContact.phone);
      expect(result.data.name).toBe('Vikram Singhania');
    });

    it('should validate tool arguments and reject invalid parameters with clear error', async () => {
      const result = await executeApprovedTool(
        'get_candidate_status',
        { phone: '' }, // invalid phone
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Candidate phone is required');
    });

    it('should execute verify_survey_completion tool, verify submission, and tag contact', async () => {
      const result = await executeApprovedTool(
        'verify_survey_completion',
        { phone: testContact.phone, surveyId: 'SURV-2026-XYZ' },
        { contactId: testContact._id.toString() }
      );

      expect(result.success).toBe(true);
      expect(result.data.verified).toBe(true);
      expect(result.data.surveyId).toBe('SURV-2026-XYZ');

      // Verify contact was updated with survey_verified tag
      const updatedContact = await Contact.findById(testContact._id);
      expect(updatedContact?.tags).toContain('survey_verified');
    });

    it('should execute request_human_assistance tool and update conversation status to human_needed', async () => {
      const conv = await Conversation.create({
        contactId: testContact._id,
        channel: 'whatsapp',
        status: 'bot',
        unreadCount: 0
      });

      const result = await executeApprovedTool(
        'request_human_assistance',
        { reason: 'Candidate asked for senior HR representative' },
        { conversationId: conv._id.toString(), contactId: testContact._id.toString() }
      );

      expect(result.success).toBe(true);
      expect(result.data.escalated).toBe(true);

      const reloadedConv = await Conversation.findById(conv._id);
      expect(reloadedConv?.status).toBe('human_needed');
    });

    it('should reject unapproved tool execution', async () => {
      const result = await executeApprovedTool(
        'execute_raw_sql_query',
        { query: 'DROP TABLE users;' },
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('is not approved');
    });
  });

  describe('AI Assistant Interactive Inbound Flow', () => {
    it('should answer candidate questions using Knowledge Base context', async () => {
      // 1. Seed Knowledge Base article
      await KnowledgeArticle.create({
        category: 'recruitment',
        title: 'Working Hours and Vacation Policy',
        content: 'Our core office hours are 10:00 AM to 5:00 PM with 25 days paid annual leave.',
        keywords: ['hours', 'vacation', 'leave', 'timing'],
        isActive: true,
        version: 1,
        createdById: managerUserId
      });

      // 2. Candidate texts an inquiry
      const incomingRes = await request(app)
        .post('/api/v1/mock/whatsapp/incoming')
        .send({
          fromPhone: testContact.phone,
          text: 'What are the vacation policy and working hours?'
        });

      expect(incomingRes.status).toBe(200);

      // 3. Verify outbound AI message was automatically dispatched
      const aiReply = await Message.findOne({
        contactId: testContact._id,
        direction: 'outbound',
        senderType: 'ai'
      });

      expect(aiReply).not.toBeNull();
      expect(aiReply?.content.body).toContain('10:00 AM to 5:00 PM');
    });

    it('should handle survey submission verification through WhatsApp interaction', async () => {
      // Candidate sends survey ID
      const incomingRes = await request(app)
        .post('/api/v1/mock/whatsapp/incoming')
        .send({
          fromPhone: testContact.phone,
          text: 'I have finished the test, my survey id is SURV-9988'
        });

      expect(incomingRes.status).toBe(200);

      // Verify contact was tagged
      const contactAfter = await Contact.findById(testContact._id);
      expect(contactAfter?.tags).toContain('survey_verified');

      // Verify AI replied with confirmation
      const aiReply = await Message.findOne({
        contactId: testContact._id,
        direction: 'outbound',
        senderType: 'ai'
      }).sort({ createdAt: -1 });

      expect(aiReply).not.toBeNull();
      expect(aiReply?.content.body).toContain('SURV-9988');
      expect(aiReply?.content.body).toContain('verified');
    });

    it('should escalate conversation to human when candidate requests assistance', async () => {
      // Candidate explicitly asks for human
      const incomingRes = await request(app)
        .post('/api/v1/mock/whatsapp/incoming')
        .send({
          fromPhone: testContact.phone,
          text: 'Can I please speak with a human agent or operator?'
        });

      expect(incomingRes.status).toBe(200);

      // Verify conversation status is now human_needed
      const conversation = await Conversation.findOne({ contactId: testContact._id });
      expect(conversation).not.toBeNull();
      expect(conversation?.status).toBe('human_needed');

      // Verify acknowledgment reply dispatched to candidate
      const aiReply = await Message.findOne({
        contactId: testContact._id,
        direction: 'outbound',
        senderType: 'ai'
      }).sort({ createdAt: -1 });

      expect(aiReply).not.toBeNull();
      expect(aiReply?.content.body).toContain('notified our team');
    });
  });
});

