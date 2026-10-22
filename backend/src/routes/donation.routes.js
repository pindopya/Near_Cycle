import { Router } from 'express';
import {
  create,
  detail,
  list,
  nearby,
  outOfStock,
  remove,
  removeImage,
  update,
  uploadImages,
} from '../controllers/donation.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { uploadDonationImages } from '../middleware/upload.middleware.js';
import { validateCreateDonation, validateNearbySearch, validateUpdateDonation } from '../validators/donation.validator.js';

export const donationRouter = Router();

donationRouter.get('/', list);
donationRouter.get('/nearby', validateNearbySearch, nearby);
donationRouter.get('/:id', detail);
donationRouter.post('/', requireAuth, validateCreateDonation, create);
donationRouter.post('/:id/images', requireAuth, uploadDonationImages, uploadImages);
donationRouter.patch('/:id', requireAuth, validateUpdateDonation, update);
donationRouter.patch('/:id/out-of-stock', requireAuth, outOfStock);
donationRouter.delete('/:id/images/:imageId', requireAuth, removeImage);
donationRouter.delete('/:id', requireAuth, remove);
