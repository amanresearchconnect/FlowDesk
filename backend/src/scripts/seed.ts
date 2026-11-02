import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { disconnectRedis } from '../config/redis.js';
import { User } from '../models/user.model.js';
import { Contact } from '../models/contact.model.js';
import { ContactList } from '../models/contact-list.model.js';
import { Workflow } from '../models/workflow.model.js';
import { KnowledgeArticle } from '../models/knowledge-base.model.js';
import { Conversation } from '../models/conversation.model.js';
import { Message } from '../models/message.model.js';
import { logger } from '../utils/logger.js';

async function seed() {
  try {
    await connectDatabase();
    logger.info('Connected to MongoDB for database seeding...');

    // 1. Seed Users (Matching 1-click test buttons in Login page)
    const demoPasswordHash = await User.hashPassword('StrongPassword123!');

    let manager = await User.findOne({ email: 'manager@company.com' });
    if (!manager) {
      manager = await User.create({
        name: 'Alice Manager',
        email: 'manager@company.com',
        passwordHash: demoPasswordHash,
        role: 'manager'
      });
      logger.info('Created user: manager@company.com');
    }

    let agent = await User.findOne({ email: 'agent@company.com' });
    if (!agent) {
      agent = await User.create({
        name: 'Sarah Agent',
        email: 'agent@company.com',
        passwordHash: demoPasswordHash,
        role: 'agent'
      });
      logger.info('Created user: agent@company.com');
    }

    let admin = await User.findOne({ email: 'admin@company.com' });
    if (!admin) {
      admin = await User.create({
        name: 'Admin User',
        email: 'admin@company.com',
        passwordHash: demoPasswordHash,
        role: 'admin'
      });
      logger.info('Created user: admin@company.com');
    }

    // 2. Seed Contact List
    let contactList = await ContactList.findOne({ name: 'Campus Tech Recruitment 2026' });
    if (!contactList) {
      contactList = await ContactList.create({
        name: 'Campus Tech Recruitment 2026',
        description: 'Screening cohort for Software Engineer and Data Analyst roles',
        totalContacts: 4,
        createdById: manager._id
      });
      logger.info('Created Contact List: Campus Tech Recruitment 2026');
    }

    // 3. Seed Candidates
    const candidates = [
      {
        phone: '+919876543210',
        firstName: 'Priya',
        lastName: 'Sharma',
        email: 'priya.sharma@example.com',
        tags: ['survey_verified', 'shortlisted'],
        customFields: { roleApplied: 'Full Stack Engineer', experience: '4 yrs', score: 92 },
        optInStatus: 'opted_in',
        contactListIds: [contactList._id]
      },
      {
        phone: '+919876543211',
        firstName: 'Rahul',
        lastName: 'Verma',
        email: 'rahul.verma@example.com',
        tags: ['screening_pending'],
        customFields: { roleApplied: 'Frontend Developer', experience: '2 yrs' },
        optInStatus: 'opted_in',
        contactListIds: [contactList._id]
      },
      {
        phone: '+919876543212',
        firstName: 'Amit',
        lastName: 'Patel',
        email: 'amit.patel@example.com',
        tags: ['screening_pending'],
        customFields: { roleApplied: 'DevOps Engineer', experience: '5 yrs' },
        optInStatus: 'opted_in',
        contactListIds: [contactList._id]
      },
      {
        phone: '+12025550199',
        firstName: 'David',
        lastName: 'Miller',
        email: 'david.miller@example.com',
        tags: ['survey_verified'],
        customFields: { roleApplied: 'Data Scientist', experience: '3 yrs', score: 88 },
        optInStatus: 'opted_in',
        contactListIds: [contactList._id]
      }
    ];

    let seededPriya: any = null;
    for (const c of candidates) {
      let contact = await Contact.findOne({ phone: c.phone });
      if (!contact) {
        contact = await Contact.create(c);
        logger.info(`Created Contact: ${c.firstName} ${c.lastName} (${c.phone})`);
      }
      if (c.phone === '+919876543210') {
        seededPriya = contact;
      }
    }

    // 4. Seed Grounded Knowledge Base Articles
    const articles = [
      {
        category: 'recruitment',
        title: 'Full Stack Engineer - Role Details & Working Hours',
        keywords: ['hours', 'timing', 'schedule', 'role', 'responsibilities', 'remote'],
        content:
          'Working hours are Monday to Friday, 9:30 AM to 6:30 PM IST. This role is full-time remote for candidates based in India. Core responsibilities include React 19 frontend development, Node.js microservices, and MongoDB optimization.',
        isActive: true,
        version: 1,
        createdById: manager._id
      },
      {
        category: 'survey',
        title: 'Technical Survey Guidelines & Evaluation Criteria',
        keywords: ['survey', 'test', 'submission', 'score', 'verification', 'drive', 'sheets'],
        content:
          'Candidates must complete the Google Forms technical survey sent via WhatsApp within 24 hours. The automated evaluation parses submitted code, system design choices, and problem solving. A score above 75 points qualifies the candidate for the technical interview round. Verified submissions appear on the recruitment Google Sheet in real time.',
        isActive: true,
        version: 1,
        createdById: manager._id
      },
      {
        category: 'general',
        title: 'Interview Process & Benefits Policy',
        keywords: ['interview', 'rounds', 'benefits', 'insurance', 'leave', 'vacation'],
        content:
          'Our hiring loop consists of: 1. WhatsApp screening survey, 2. Technical architectural round (45 mins), 3. Hiring Manager conversation. FlowDesk provides comprehensive health insurance, annual learning stipends, and 24 paid vacation days per calendar year.',
        isActive: true,
        version: 1,
        createdById: manager._id
      }
    ];

    for (const art of articles) {
      const exists = await KnowledgeArticle.findOne({ title: art.title });
      if (!exists) {
        await KnowledgeArticle.create(art);
        logger.info(`Created Knowledge Article: ${art.title}`);
      }
    }

    // 5. Seed Workflow Definition
    let workflow = await Workflow.findOne({ name: 'End-to-End Recruitment & Survey Verification' });
    if (!workflow) {
      workflow = await Workflow.create({
        name: 'End-to-End Recruitment & Survey Verification',
        description:
          'Screening flow: WhatsApp outreach, AI conversational Q&A, real-time Google Sheets survey verification, and interview routing.',
        version: 1,
        isPublished: true,
        createdById: manager._id,
        nodes: [
          {
            id: 'step_1_trigger',
            type: 'trigger',
            name: 'Inbound WhatsApp Keyword Trigger',
            config: { keywords: ['APPLY', 'HI'], channel: 'whatsapp' },
            nextStepId: 'step_2_intro'
          },
          {
            id: 'step_2_intro',
            type: 'send_message',
            name: 'Dispatch Job Details & Survey Form Link',
            config: {
              template: 'recruitment_screening_intro',
              params: { role: 'Full Stack Engineer', surveyLink: 'https://forms.gle/FlowDeskSurvey' }
            },
            nextStepId: 'step_3_wait'
          },
          {
            id: 'step_3_wait',
            type: 'wait_for_reply',
            name: 'Wait for Candidate Submission',
            config: { timeoutHours: 24, fallbackAction: 'escalate_or_reminder' },
            nextStepId: 'step_4_ai_qa'
          },
          {
            id: 'step_4_ai_qa',
            type: 'ai_conversation',
            name: 'AI Conversational Assistant Q&A',
            config: {
              model: 'gemini-1.5-flash',
              grounding: 'knowledge_base',
              allowedTools: ['get_job_details', 'verify_survey_completion', 'request_human_assistance'],
              confidenceThreshold: 0.6
            },
            nextStepId: 'step_5_verify_sheets'
          },
          {
            id: 'step_5_verify_sheets',
            type: 'verify_data',
            name: 'Verify Candidate Submission in Google Sheets',
            config: {
              provider: 'google_sheets',
              spreadsheetId: 'FLOWDESK_SURVEY_DRIVE_SHEET',
              lookupField: 'phoneNumber',
              matchColumn: 'Phone Number',
              cacheTtlSeconds: 60
            },
            branches: [
              { conditionType: 'equals', conditionValue: 'true', targetStepId: 'step_6_route_interview' },
              { conditionType: 'default', targetStepId: 'step_7_send_reminder' }
            ]
          },
          {
            id: 'step_6_route_interview',
            type: 'update_record',
            name: 'Tag survey_verified & Schedule Technical Round',
            config: {
              addTags: ['survey_verified', 'interview_scheduled'],
              status: 'qualified'
            }
          },
          {
            id: 'step_7_send_reminder',
            type: 'send_message',
            name: 'Send Follow-up Survey Link & FAQ Assistance',
            config: {
              template: 'survey_reminder_prompt'
            }
          }
        ]
      });
      logger.info('Created Workflow: End-to-End Recruitment & Survey Verification');
    }

    // 6. Seed Active Team Inbox Conversation with Priya Sharma
    if (seededPriya) {
      let conv = await Conversation.findOne({ contactId: seededPriya._id });
      if (!conv) {
        conv = await Conversation.create({
          contactId: seededPriya._id,
          channel: 'whatsapp',
          status: 'bot',
          lastMessageAt: new Date(),
          lastMessagePreview: 'Yes, I have submitted the survey form. Can you verify my application status?',
          unreadCount: 1,
          tags: ['recruitment_2026', 'survey_verified']
        });

        // Add 2 messages to thread
        await Message.create({
          conversationId: conv._id,
          contactId: seededPriya._id,
          direction: 'outbound',
          senderType: 'system',
          provider: 'mock',
          providerMessageId: 'mock_seed_msg_01',
          type: 'text',
          content: {
            body: 'Hi Priya, thank you for applying to FlowDesk! Please complete our technical survey at https://forms.gle/FlowDeskSurvey'
          },
          status: 'read',
          sentAt: new Date(Date.now() - 3600 * 1000),
          deliveredAt: new Date(Date.now() - 3550 * 1000),
          readAt: new Date(Date.now() - 3500 * 1000)
        });

        await Message.create({
          conversationId: conv._id,
          contactId: seededPriya._id,
          direction: 'inbound',
          senderType: 'contact',
          provider: 'mock',
          providerMessageId: 'mock_seed_msg_02',
          type: 'text',
          content: {
            body: 'Yes, I have submitted the survey form. Can you verify my application status?'
          },
          status: 'delivered',
          deliveredAt: new Date()
        });

        logger.info('Created active Conversation thread for Priya Sharma in Team Inbox');
      }
    }

    logger.info('✅ Database seeding finished successfully.');
  } catch (err: any) {
    logger.error('Database seeding failed', { error: err.message });
    process.exit(1);
  } finally {
    await disconnectDatabase();
    await disconnectRedis();
    process.exit(0);
  }
}

seed();

