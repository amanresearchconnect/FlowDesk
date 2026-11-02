import { Server as SocketIOServer, Socket } from 'socket.io';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { TokenPayload } from '../modules/auth/auth.service.js';
import { logger } from '../utils/logger.js';

let ioInstance: SocketIOServer | null = null;

export function initSocketServer(server: http.Server): SocketIOServer {
  const io = new SocketIOServer(server, {
    cors: {
      origin: env.CLIENT_URL,
      credentials: true
    }
  });

  // Authentication middleware for Socket connections
  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization?.startsWith('Bearer ')
        ? socket.handshake.headers.authorization.split(' ')[1]
        : null);

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
      socket.data.user = {
        id: decoded.sub,
        email: decoded.email,
        role: decoded.role
      };
      next();
    } catch {
      next(new Error('Invalid or expired authentication token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    logger.info('Socket client authenticated and connected', {
      socketId: socket.id,
      userId: user?.id,
      role: user?.role
    });

    // Auto-join personal user room
    if (user?.id) {
      socket.join(`user:${user.id}`);
    }

    // Join team inbox room
    socket.on('join:inbox', () => {
      socket.join('inbox:team');
      logger.debug('Socket joined inbox:team', { socketId: socket.id });
    });

    // Join specific conversation room
    socket.on('join:conversation', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
      logger.debug('Socket joined conversation room', { socketId: socket.id, conversationId });
    });

    // Leave conversation room
    socket.on('leave:conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      logger.debug('Socket left conversation room', { socketId: socket.id, conversationId });
    });

    socket.on('disconnect', () => {
      logger.debug('Socket client disconnected', { socketId: socket.id });
    });
  });

  ioInstance = io;
  return io;
}

export function getSocketServer(): SocketIOServer | null {
  return ioInstance;
}

export function emitToTeam(event: string, payload: any): void {
  if (ioInstance) {
    ioInstance.to('inbox:team').emit(event, payload);
  }
}

export function emitToConversation(conversationId: string, event: string, payload: any): void {
  if (ioInstance) {
    ioInstance.to(`conversation:${conversationId}`).emit(event, payload);
  }
}

export function emitToUser(userId: string, event: string, payload: any): void {
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit(event, payload);
  }
}

