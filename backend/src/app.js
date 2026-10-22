import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { apiRateLimiter } from './middleware/security.middleware.js';
import { adminRouter } from './routes/admin.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { donationRouter } from './routes/donation.routes.js';
import { reportRouter } from './routes/report.routes.js';
import { routeRouter } from './routes/route.routes.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.frontendUrl, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '1mb', strict: true }));
app.use(cookieParser());
app.use('/uploads', express.static(path.resolve('uploads'), { dotfiles: 'deny', maxAge: '1h' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ogtb-donation-map-api' });
});

app.use('/api', apiRateLimiter);
app.use('/api/auth', authRouter);
app.use('/api/donations', reportRouter);
app.use('/api/donations', donationRouter);
app.use('/api/routes', routeRouter);
app.use('/api/admin', adminRouter);

app.use(notFoundHandler);
app.use(errorHandler);
