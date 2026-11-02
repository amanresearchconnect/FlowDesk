import { connectDatabase, disconnectDatabase } from './config/database.js';
import { disconnectRedis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';

async function startWorker() {
  try {
    logger.info('Initializing FlowDesk Background Worker...', { env: env.NODE_ENV });
    await connectDatabase();

    logger.info('Background Worker active and listening to BullMQ queues');

    const shutdown = async (signal: string) => {
      logger.info(`Worker received ${signal}. Closing queue listeners...`);
      await disconnectDatabase();
      await disconnectRedis();
      logger.info('Worker cleanly shut down');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error: any) {
    logger.error('Failed to initialize background worker', { error: error.message });
    process.exit(1);
  }
}

startWorker();

