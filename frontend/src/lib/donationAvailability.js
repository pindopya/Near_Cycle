export function canNavigateToDonation(donation, nowMs = Date.now()) {
  if (!donation || donation.status !== 'AVAILABLE' || donation.isHidden) return false;

  const start = new Date(donation.startDate).getTime();
  const end = new Date(donation.endDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;

  return start <= nowMs && end >= nowMs;
}
