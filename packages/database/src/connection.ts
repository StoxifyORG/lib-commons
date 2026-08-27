import mongoose from 'mongoose';
import { logger } from '@stoxifyorg/logger';

export async function connectDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
  mongoose.connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB connection error');
    process.exit(1);
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
}
