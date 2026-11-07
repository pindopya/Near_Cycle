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
import { UPLOAD_ROOT } from './services/donation.service.js';

export const app = express();

app.disable('x-powered-by');
// Requests arrive through the Next.js proxy (loopback / Docker network); trust only those hops
// so rate limits key on the real client IP instead of lumping every user into one bucket.
app.set('trust proxy', 'loopback, uniquelocal');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.frontendUrl, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '1mb', strict: true }));
app.use(cookieParser());
// Upload filenames are random UUIDs that are never rewritten, so browsers can cache them for good.
app.use('/uploads', express.static(UPLOAD_ROOT, { dotfiles: 'deny', maxAge: '30d', immutable: true }));

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
