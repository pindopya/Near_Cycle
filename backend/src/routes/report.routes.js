import { Router } from 'express';
import { create } from '../controllers/report.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { reportRateLimiter } from '../middleware/security.middleware.js';
import { validateCreateReport } from '../validators/report.validator.js';

export const reportRouter = Router();

reportRouter.post('/:donationId/reports', requireAuth, reportRateLimiter, validateCreateReport, create);
