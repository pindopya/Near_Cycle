import { Router } from 'express';
import {
  donationDetail,
  donations,
  removeDonation,
  reportDetail,
  reports,
  updateDonationVisibility,
  updateReport,
  updateUserStatus,
  users,
} from '../controllers/admin.controller.js';
import { requireAdmin } from '../middleware/admin.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/users', users);
adminRouter.patch('/users/:id/status', updateUserStatus);

adminRouter.get('/donations', donations);
adminRouter.get('/donations/:id', donationDetail);
adminRouter.patch('/donations/:id/visibility', updateDonationVisibility);
adminRouter.delete('/donations/:id', removeDonation);

adminRouter.get('/reports', reports);
adminRouter.get('/reports/:id', reportDetail);
adminRouter.patch('/reports/:id', updateReport);
