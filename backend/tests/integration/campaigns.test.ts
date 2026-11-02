import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { User } from '../../src/models/user.model.js';
import { ContactList } from '../../src/models/contact-list.model.js';
import { Contact } from '../../src/models/contact.model.js';
import { Campaign } from '../../src/models/campaign.model.js';
import { Message } from '../../src/models/message.model.js';
import { mockWhatsAppProvider } from '../../src/providers/messaging/mock-whatsapp.provider.js';

const app = createApp();

describe('Campaigns & Mock WhatsApp Messaging Integration Tests', () => {
  let managerToken: string;
  let managerUserId: string;
  let contactListId: string;

  beforeEach(async () => {
    // Speed up status transitions for test suite
    mockWhatsAppProvider.simulationDelayMs = 20;

    // 1. Create manager user
    const manager = await User.create({
      name: 'Manager Bob',
      email: `bob_${Date.now()}_${Math.random()}@company.com`,
      passwordHash: await User.hashPassword('StrongPassword123!'),
      role: 'manager'
    });
    managerUserId = manager._id.toString();

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: manager.email,
      password: 'StrongPassword123!'
    });
    managerToken = loginRes.body.data.accessToken;

    // 2. Create contact list
    const list = await ContactList.create({
      name: 'Engineering Batch 2026',
      sourceType: 'csv_upload',
      totalCount: 3,
      validCount: 3,
      createdById: managerUserId
    });
    contactListId = list._id.toString();

    // 3. Seed 3 candidates
    await Contact.create([
      {
        phone: '+919876543210',
        firstName: 'Rahul',
        lastName: 'Verma',
        contactListIds: [list._id],
        customFields: { roleApplied: 'Node.js Developer' },
        optInStatus: 'opted_in'
      },
      {
        phone: '+919876543211',
        firstName: 'Priya',
        lastName: 'Sharma',
        contactListIds: [list._id],
        customFields: { roleApplied: 'React Developer' },
        optInStatus: 'opted_in'
      },
      {
        phone: '+919876543212',
        firstName: 'Amit',
        lastName: 'Patel',
        contactListIds: [list._id],
        customFields: { roleApplied: 'DevOps Engineer' },
        optInStatus: 'opted_in'
      }
    ]);
  });

  it('should create, launch, dispatch personalized messages, track delivery, and receive candidate reply', async () => {
    // 1. Create campaign
    const createRes = await request(app)
      .post('/api/v1/campaigns')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        name: 'Tech Recruitment Drive 2026',
        description: 'First touch message for shortlisted engineers',
        contactListId,
        messageTemplate: 'Hi {{firstName}}, are you interested in the {{roleApplied}} role? Reply YES or NO'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    const campaignId = createRes.body.data.id;
    expect(createRes.body.data.status).toBe('draft');
    expect(createRes.body.data.stats.totalContacts).toBe(0);

    // 2. Launch campaign
    const launchRes = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/launch`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(launchRes.status).toBe(200);
    expect(launchRes.body.success).toBe(true);
    expect(launchRes.body.data.status).toBe('running');
    expect(launchRes.body.data.dispatched).toBe(3);

    // 3. Verify outbound messages in DB with personalized template replacements
    const messages = await Message.find({ campaignId }).sort({ createdAt: 1 });
    expect(messages.length).toBe(3);

    const rahulMsg = messages.find((m) => m.content.body?.includes('Rahul'));
    expect(rahulMsg).toBeDefined();
    expect(rahulMsg?.content.body).toBe(
      'Hi Rahul, are you interested in the Node.js Developer role? Reply YES or NO'
    );
    expect(rahulMsg?.direction).toBe('outbound');
    expect(rahulMsg?.providerMessageId).toBeDefined();

    const priyaMsg = messages.find((m) => m.content.body?.includes('Priya'));
    expect(priyaMsg?.content.body).toBe(
      'Hi Priya, are you interested in the React Developer role? Reply YES or NO'
    );

    // 4. Wait for simulated delivery and read receipts
    await new Promise((resolve) => setTimeout(resolve, 200));

    // 5. Check live campaign stats
    const statsRes = await request(app)
      .get(`/api/v1/campaigns/${campaignId}/stats`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.data.stats.totalContacts).toBe(3);
    expect(statsRes.body.data.stats.dispatched).toBe(3);
    expect(statsRes.body.data.stats.delivered).toBe(3);
    expect(statsRes.body.data.stats.read).toBe(3);
    expect(statsRes.body.data.stats.replied).toBe(0);

    // 6. Simulate candidate reply via Mock WhatsApp incoming API
    const replyRes = await request(app)
      .post('/api/v1/mock/whatsapp/incoming')
      .send({
        fromPhone: '+919876543210',
        text: 'YES'
      });

    expect(replyRes.status).toBe(200);
    expect(replyRes.body.success).toBe(true);
    expect(replyRes.body.data.campaignId).toBe(campaignId);
    expect(replyRes.body.data.message.content.body).toBe('YES');
    expect(replyRes.body.data.message.direction).toBe('inbound');

    // 7. Verify campaign stats incremented 'replied'
    const updatedStatsRes = await request(app)
      .get(`/api/v1/campaigns/${campaignId}/stats`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(updatedStatsRes.status).toBe(200);
    expect(updatedStatsRes.body.data.stats.replied).toBe(1);
  });
});
