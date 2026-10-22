import {
  addDonationImages,
  createDonation,
  deleteDonation,
  deleteDonationImage,
  getDonationById,
  listDonations,
  markDonationOutOfStock,
  updateDonation,
} from '../services/donation.service.js';
import { listNearbyDonations } from '../services/map.service.js';

export async function list(_req, res, next) {
  try {
    res.json(await listDonations());
  } catch (error) {
    next(error);
  }
}

export async function nearby(req, res, next) {
  try {
    res.json(await listNearbyDonations(req.validatedQuery));
  } catch (error) {
    next(error);
  }
}

export async function detail(req, res, next) {
  try {
    res.json(await getDonationById(req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function create(req, res, next) {
  try {
    const donation = await createDonation(req.user.id, req.validatedBody);
    res.status(201).json(donation);
  } catch (error) {
    next(error);
  }
}

export async function update(req, res, next) {
  try {
    res.json(await updateDonation(req.params.id, req.user.id, req.validatedBody));
  } catch (error) {
    next(error);
  }
}

export async function remove(req, res, next) {
  try {
    await deleteDonation(req.params.id, req.user.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function outOfStock(req, res, next) {
  try {
    res.json(await markDonationOutOfStock(req.params.id, req.user.id));
  } catch (error) {
    next(error);
  }
}

export async function uploadImages(req, res, next) {
  try {
    const images = await addDonationImages(req.params.id, req.user.id, req.files);
    res.status(201).json(images);
  } catch (error) {
    next(error);
  }
}

export async function removeImage(req, res, next) {
  try {
    await deleteDonationImage(req.params.id, req.params.imageId, req.user.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
