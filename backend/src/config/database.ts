import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let isConnected = false;

export async function connectDatabase(uri = env.MONGODB_URI): Promise<typeof mongoose> {
  if (isConnected) {
    return mongoose;
  }

  mongoose.connection.on('connected', () => {
    isConnected = true;
    logger.info('MongoDB connection established', { host: mongoose.connection.host });
  });

  mongoose.connection.on('error', (err) => {
    isConnected = false;
    logger.error('MongoDB connection error', { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    logger.warn('MongoDB connection lost');
  });

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: env.NODE_ENV !== 'production'
    });
    isConnected = true;
    return mongoose;
  } catch (error: any) {
    logger.error('Failed to connect to MongoDB', { error: error.message });
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB connection closed');
  }
}

