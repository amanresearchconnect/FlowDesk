import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { disconnectRedis } from '../config/redis.js';
import { User } from '../models/user.model.js';
import { logger } from '../utils/logger.js';

async function seed() {
  try {
    await connectDatabase();
    logger.info('Connected to MongoDB for user verification...');

    // Seed/Verify 3 demo users matching 1-click test buttons in Login page
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
    } else {
      manager.passwordHash = demoPasswordHash;
      await manager.save();
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
    } else {
      agent.passwordHash = demoPasswordHash;
      await agent.save();
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
    } else {
      admin.passwordHash = demoPasswordHash;
      await admin.save();
    }

    logger.info('✅ 3 Easy-Login accounts verified (admin, manager, agent). No mock seed data created.');
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
