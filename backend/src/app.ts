import './config/env';
import express from 'express';
import { HttpError } from './errors/http-error';
import { errorHandler } from './middleware/error-handler';
import { apiRouter } from './routes/api';
import './models';

export const app = express();

app.disable('x-powered-by');
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
app.use((request, response, next) => {
  const origin = request.header('Origin');
  if (origin === frontendOrigin) {
    response.header('Access-Control-Allow-Origin', frontendOrigin);
  }
  response.header('Vary', 'Origin');
  if (request.method === 'OPTIONS') {
    response.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    response.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    response.sendStatus(origin === frontendOrigin ? 204 : 403);
    return;
  }
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use('/api', apiRouter);
app.use((_request, _response, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'Route was not found'));
});
app.use(errorHandler);