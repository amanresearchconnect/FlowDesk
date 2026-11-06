import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle Mongoose Validation Errors
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e: any) => ({
      field: e.path,
      issue: e.message
    }));
    logger.warn('Mongoose Validation Error', {
      path: req.originalUrl,
      details
    });
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message || 'Database validation failed',
        details
      }
    });
    return;
  }

  // Handle Mongoose Cast Errors (invalid ObjectIds etc.)
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_DATA_FORMAT',
        message: `Invalid format for field '${err.path}'`
      }
    });
    return;
  }

  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const code = isAppError ? err.code : 'INTERNAL_SERVER_ERROR';
  const message = isAppError
    ? err.message
    : (env.NODE_ENV === 'development' ? err.message : 'An unexpected internal error occurred');
  const details = isAppError ? err.details : undefined;

  // Log error with request context
  logger.error(err.message, {
    code,
    statusCode,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    details,
    stack: env.NODE_ENV === 'development' ? err.stack : undefined
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(env.NODE_ENV === 'development' && !isAppError ? { stack: err.stack } : {})
    }
  });
}
