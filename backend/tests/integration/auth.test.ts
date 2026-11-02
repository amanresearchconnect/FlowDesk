import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { User } from '../../src/models/user.model.js';

const app = createApp();

describe('Auth & RBAC Integration Tests', () => {
  const validUser = {
    name: 'Sarah Connor',
    email: 'sarah@skynet-defense.com',
    password: 'SecurePassword123!',
    role: 'manager' as const
  };

  it('GET /health - should return 200 OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('flowdesk-api');
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully and return access and refresh tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validUser);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(validUser.email);
      expect(res.body.data.user.role).toBe(validUser.role);
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();

      // Check cookie was set
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain('flowdesk_refresh_token');

      // Verify stored in DB
      const dbUser = await User.findOne({ email: validUser.email });
      expect(dbUser).not.toBeNull();
    });

    it('should fail when registering with an existing email', async () => {
      await request(app).post('/api/v1/auth/register').send(validUser);

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validUser);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('should fail with validation error when password is too weak', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...validUser,
          password: '123'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should authenticate user with valid credentials', async () => {
      await request(app).post('/api/v1/auth/register').send(validUser);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: validUser.email,
          password: validUser.password
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(validUser.email);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('should reject login with wrong password', async () => {
      await request(app).post('/api/v1/auth/register').send(validUser);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: validUser.email,
          password: 'WrongPassword999!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject login for non-existent user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'unknown@company.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return profile for authenticated user', async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send(validUser);
      const token = regRes.body.data.accessToken;

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(validUser.email);
      expect(res.body.data.user.name).toBe(validUser.name);
    });

    it('should reject access when no token is provided', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should issue a new access token when provided with a valid refresh token', async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send(validUser);
      const refreshToken = regRes.body.data.refreshToken;

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('should reject refresh with an invalid token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid.jwt.token' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Role-Based Access Control (RBAC)', () => {
    it('should permit manager access to manager-only endpoint and deny agent', async () => {
      // Register an agent
      const agentRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Agent Smith',
          email: 'smith@agent.com',
          password: 'Password123!',
          role: 'agent'
        });
      const agentToken = agentRes.body.data.accessToken;

      // Register a manager
      const managerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Manager Jones',
          email: 'jones@company.com',
          password: 'Password123!',
          role: 'manager'
        });
      const managerToken = managerRes.body.data.accessToken;

      // Agent attempting manager endpoint -> 403 Forbidden
      const agentAttempt = await request(app)
        .get('/api/v1/test/rbac-manager')
        .set('Authorization', `Bearer ${agentToken}`);

      expect(agentAttempt.status).toBe(403);
      expect(agentAttempt.body.error.code).toBe('FORBIDDEN');

      // Manager accessing manager endpoint -> 200 OK
      const managerAttempt = await request(app)
        .get('/api/v1/test/rbac-manager')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(managerAttempt.status).toBe(200);
      expect(managerAttempt.body.data.message).toBe('Manager access granted');

      // Manager attempting admin endpoint -> 403 Forbidden
      const managerAdminAttempt = await request(app)
        .get('/api/v1/test/rbac-admin')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(managerAdminAttempt.status).toBe(403);
      expect(managerAdminAttempt.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should clear refresh token cookie and return success message', async () => {
      const regRes = await request(app).post('/api/v1/auth/register').send(validUser);
      const token = regRes.body.data.accessToken;

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('logged out');
    });
  });
});

