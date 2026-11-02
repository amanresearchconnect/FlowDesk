import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { Contact } from '../../src/models/contact.model.js';
import { ContactList } from '../../src/models/contact-list.model.js';
import { User } from '../../src/models/user.model.js';

const app = createApp();

describe('Contacts & Spreadsheet Ingestion Integration Tests', () => {
  let managerToken: string;
  let agentToken: string;
  let managerUserId: string;

  beforeEach(async () => {
    // Create manager user
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

    // Create agent user
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
  });

  // Sample CSV buffer with valid rows, an in-batch duplicate, and an invalid phone row
  const csvContent = [
    'Candidate Name,Mobile Phone,Email,Job Title,Survey Code',
    'Rajesh Kumar,9876543210,rajesh@example.com,Backend Dev,SURV-001',
    'Priya Sharma,+919876543211,priya@example.com,Frontend Dev,SURV-002',
    'Duplicate Priya,9876543211,priya.dup@example.com,Frontend Dev,SURV-002', // In-batch duplicate of Priya
    'John Doe,+12025550123,john@example.com,DevOps,SURV-003',
    'Broken Record,not-a-valid-phone,broken@example.com,QA,SURV-004' // Invalid phone
  ].join('\n');

  describe('POST /api/v1/contacts/upload-preview', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .post('/api/v1/contacts/upload-preview')
        .attach('file', Buffer.from(csvContent), 'candidates.csv');

      expect(res.status).toBe(401);
    });

    it('should reject agent role (manager or admin required)', async () => {
      const res = await request(app)
        .post('/api/v1/contacts/upload-preview')
        .set('Authorization', `Bearer ${agentToken}`)
        .attach('file', Buffer.from(csvContent), 'candidates.csv');

      expect(res.status).toBe(403);
    });

    it('should parse CSV and return headers, sample rows, and file token for manager', async () => {
      const res = await request(app)
        .post('/api/v1/contacts/upload-preview')
        .set('Authorization', `Bearer ${managerToken}`)
        .attach('file', Buffer.from(csvContent), 'candidates.csv');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fileToken).toBeDefined();
      expect(res.body.data.totalRows).toBe(5);
      expect(res.body.data.detectedHeaders).toContain('Candidate Name');
      expect(res.body.data.detectedHeaders).toContain('Mobile Phone');
      expect(res.body.data.detectedHeaders).toContain('Job Title');
      expect(res.body.data.sampleRows.length).toBe(5);
    });
  });

  describe('POST /api/v1/contacts/import', () => {
    it('should map columns, normalize phones, skip duplicates, and record error counts', async () => {
      // 1. Upload preview to obtain fileToken
      const previewRes = await request(app)
        .post('/api/v1/contacts/upload-preview')
        .set('Authorization', `Bearer ${managerToken}`)
        .attach('file', Buffer.from(csvContent), 'candidates.csv');

      const fileToken = previewRes.body.data.fileToken;

      // 2. Execute import
      const importPayload = {
        fileToken,
        listName: 'Recruitment Batch Q4',
        description: 'Engineering candidates for Q4 hiring',
        countryCode: 'IN',
        tags: ['batch_q4', 'engineering'],
        mappings: {
          phone: 'Mobile Phone',
          firstName: 'Candidate Name',
          email: 'Email',
          customFields: {
            roleApplied: 'Job Title',
            surveyId: 'Survey Code'
          }
        }
      };

      const res = await request(app)
        .post('/api/v1/contacts/import')
        .set('Authorization', `Bearer ${managerToken}`)
        .send(importPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.contactListId).toBeDefined();
      expect(res.body.data.totalRows).toBe(5);
      expect(res.body.data.validCount).toBe(3); // Rajesh (+919876543210), Priya (+919876543211), John (+12025550123)
      expect(res.body.data.duplicateCount).toBe(1); // Duplicate Priya
      expect(res.body.data.errorCount).toBe(1); // Broken Record

      // Verify ContactList persisted in DB
      const list = await ContactList.findById(res.body.data.contactListId);
      expect(list).not.toBeNull();
      expect(list?.name).toBe('Recruitment Batch Q4');
      expect(list?.validCount).toBe(3);
      expect(list?.duplicateCount).toBe(1);
      expect(list?.errorCount).toBe(1);

      // Verify Contacts persisted in DB with E.164 normalization
      const rajesh = await Contact.findOne({ phone: '+919876543210' });
      expect(rajesh).not.toBeNull();
      expect(rajesh?.firstName).toBe('Rajesh Kumar');
      expect(rajesh?.email).toBe('rajesh@example.com');
      expect(rajesh?.customFields.roleApplied).toBe('Backend Dev');
      expect(rajesh?.customFields.surveyId).toBe('SURV-001');
      expect(rajesh?.tags).toContain('batch_q4');
      expect(rajesh?.optInStatus).toBe('opted_in');

      // Verify international phone
      const john = await Contact.findOne({ phone: '+12025550123' });
      expect(john).not.toBeNull();
      expect(john?.firstName).toBe('John Doe');
    });

    it('should reject import when using an invalid or expired file token', async () => {
      const res = await request(app)
        .post('/api/v1/contacts/import')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          fileToken: 'expired_or_bogus_token',
          listName: 'Bogus List',
          mappings: { phone: 'Phone' }
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/contacts and /contact-lists', () => {
    beforeEach(async () => {
      const list = await ContactList.create({
        name: 'Seeded Candidates List',
        sourceType: 'csv_upload',
        totalCount: 2,
        validCount: 2,
        createdById: managerUserId
      });

      await Contact.create([
        {
          phone: '+919876543210',
          firstName: 'Rajesh Kumar',
          email: 'rajesh@example.com',
          contactListIds: [list._id],
          tags: ['engineering'],
          optInStatus: 'opted_in'
        },
        {
          phone: '+919876543211',
          firstName: 'Priya Sharma',
          email: 'priya@example.com',
          contactListIds: [list._id],
          tags: ['design'],
          optInStatus: 'opted_in'
        }
      ]);
    });

    it('should list imported contacts with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/contacts?page=1&limit=10')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.total).toBe(2);
    });

    it('should search contacts by name', async () => {
      const res = await request(app)
        .get('/api/v1/contacts?search=Rajesh')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].firstName).toBe('Rajesh Kumar');
    });

    it('should list all created contact lists', async () => {
      const res = await request(app)
        .get('/api/v1/contact-lists')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Seeded Candidates List');
    });
  });
});
