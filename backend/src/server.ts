import http from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { disconnectRedis } from './config/redis.js';
import { initSocketServer } from './socket/socket.server.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

async function bootstrap() {
  try {
    // Connect to MongoDB
    await connectDatabase();

    const app = createApp();
    const server = http.createServer(app);

    // Initialize Socket.IO
    initSocketServer(server);

    server.listen(env.PORT, () => {
      logger.info(`FlowDesk API server listening on port ${env.PORT}`, {
        env: env.NODE_ENV,
        prefix: env.API_PREFIX
      });
    });

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await disconnectDatabase();
        await disconnectRedis();
        logger.info('Server successfully terminated');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error: any) {
    logger.error('Failed to start API server', { error: error.message });
    process.exit(1);
  }
}

bootstrap();

