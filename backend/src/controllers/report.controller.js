import { createReport } from '../services/report.service.js';

export async function create(req, res, next) {
  try {
    const report = await createReport(req.user.id, req.params.donationId, req.validatedBody);
    res.status(201).json(report);
  } catch (error) {
    next(error);
  }
}
