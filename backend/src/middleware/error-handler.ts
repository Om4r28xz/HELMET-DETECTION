import { ErrorRequestHandler } from 'express';
import { UniqueConstraintError, ValidationError } from 'sequelize';
import { ZodError } from 'zod';
import { HttpError } from '../errors/http-error';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
    response.status(413).json({ error: { code: 'REQUEST_TOO_LARGE', message: 'Request body exceeds the allowed size' } });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.issues }
    });
    return;
  }

  if (error instanceof UniqueConstraintError) {
    response.status(409).json({ error: { code: 'CONFLICT', message: 'A record with these values already exists' } });
    return;
  }

  if (error instanceof ValidationError) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'The submitted data is invalid' } });
    return;
  }

  console.error(error);
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
};