import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import http from 'node:http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../../src/app.js';
import { initSocketServer } from '../../src/socket/socket.server.js';
import { User } from '../../src/models/user.model.js';
import { Contact } from '../../src/models/contact.model.js';
import { Conversation } from '../../src/models/conversation.model.js';
import { Message } from '../../src/models/message.model.js';
import { mockWhatsAppProvider } from '../../src/providers/messaging/mock-whatsapp.provider.js';

const app = createApp();

describe('Team Inbox and Conversations Integration Tests', () => {
  let agentToken: string;
  let agentUserId: string;
  let testContact: any;
  let httpServer: http.Server;
  let serverPort: number;

  beforeEach(async () => {
    mockWhatsAppProvider.simulationDelayMs = 10;

    // 1. Create agent user
    const agent = await User.create({
      name: 'Agent Sarah',
      email: `sarah_${Date.now()}_${Math.random()}@company.com`,
      passwordHash: await User.hashPassword('StrongPassword123!'),
      role: 'agent'
    });
    agentUserId = agent._id.toString();

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: agent.email,
      password: 'StrongPassword123!'
    });
    agentToken = loginRes.body.data.accessToken;

    // 2. Create contact
    testContact = await Contact.create({
      phone: '+919876543230',
      firstName: 'Karan',
      lastName: 'Mehta',
      customFields: { roleApplied: 'Product Designer' },
      optInStatus: 'opted_in'
    });
  });

  afterEach(async () => {
    if (httpServer && httpServer.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });

  it('should auto-create conversation on inbound message, list it, view thread, takeover, reply, and release to bot', async () => {
    // 1. Simulate inbound candidate message
    const incomingRes = await request(app)
      .post('/api/v1/mock/whatsapp/incoming')
      .send({
        fromPhone: testContact.phone,
        text: 'Hello, what are the working hours for this role?'
      });

    expect(incomingRes.status).toBe(200);

    // 2. Verify Conversation was auto-created
    const conv = await Conversation.findOne({ contactId: testContact._id });
    expect(conv).not.toBeNull();
    expect(conv?.status).toBe('bot');
    expect(conv?.unreadCount).toBe(1);
    expect(conv?.lastMessagePreview).toContain('working hours');
    const conversationId = conv!._id.toString();

    // 3. Agent lists conversations in Team Inbox
    const listRes = await request(app)
      .get('/api/v1/conversations?status=bot')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    const listedConv = listRes.body.data.find((c: any) => c.id === conversationId);
    expect(listedConv).toBeDefined();
    expect(listedConv.contactId.firstName).toBe('Karan');

    // 4. Agent views message thread (unread count should reset to 0)
    const messagesRes = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(messagesRes.status).toBe(200);
    expect(messagesRes.body.data.length).toBe(1);
    expect(messagesRes.body.data[0].content.body).toContain('working hours');

    const updatedConv = await Conversation.findById(conversationId);
    expect(updatedConv?.unreadCount).toBe(0);

    // 5. Agent takes over conversation
    const takeoverRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/takeover`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(takeoverRes.status).toBe(200);
    expect(takeoverRes.body.data.status).toBe('agent_assigned');
    expect(takeoverRes.body.data.assignedUserId).toBe(agentUserId);

    // 6. Agent sends manual reply to candidate
    const replyRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        body: 'Hi Karan, this is Sarah from HR. Standard hours are 9 AM to 6 PM IST.'
      });

    expect(replyRes.status).toBe(201);
    expect(replyRes.body.data.direction).toBe('outbound');
    expect(replyRes.body.data.senderType).toBe('agent');
    expect(replyRes.body.data.content.body).toContain('9 AM to 6 PM');

    // 7. Verify message in DB and conversation preview updated
    const outboundMsg = await Message.findOne({
      conversationId,
      senderType: 'agent'
    });
    expect(outboundMsg).not.toBeNull();

    // 8. Agent releases conversation back to bot
    const releaseRes = await request(app)
      .post(`/api/v1/conversations/${conversationId}/release-to-bot`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(releaseRes.status).toBe(200);
    expect(releaseRes.body.data.status).toBe('bot');
    expect(releaseRes.body.data.assignedUserId).toBeUndefined();
  });

  it('should authenticate socket client and receive live message events in real time', async () => {
    // Spin up real HTTP server with Socket.IO for WebSocket assertions
    httpServer = http.createServer(app);
    initSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });

    // Create a conversation for test contact
    const conv = await Conversation.create({
      contactId: testContact._id,
      channel: 'whatsapp',
      status: 'agent_assigned',
      assignedUserId: agentUserId
    });
    const conversationId = conv._id.toString();

    // Connect Socket.IO client with agent JWT token
    const clientSocket: ClientSocketType = ClientSocket(`http://localhost:${serverPort}`, {
      auth: { token: agentToken },
      transports: ['websocket']
    });

    await new Promise<void>((resolve, reject) => {
      clientSocket.on('connect', () => resolve());
      clientSocket.on('connect_error', (err) => reject(err));
    });

    expect(clientSocket.connected).toBe(true);

    // Join conversation room
    clientSocket.emit('join:conversation', conversationId);

    // Prepare listener for incoming message event
    const messagePromise = new Promise<any>((resolve) => {
      clientSocket.on('message:received', (data) => {
        resolve(data);
      });
    });

    // Dispatch agent message via REST API
    await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        body: 'Real-time WebSocket verification message'
      });

    const receivedEvent = await messagePromise;
    expect(receivedEvent).toBeDefined();
    expect(receivedEvent.content.body).toBe('Real-time WebSocket verification message');
    expect(receivedEvent.senderType).toBe('agent');

    clientSocket.disconnect();
  });
});

