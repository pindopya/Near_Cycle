import { DonationStatus } from '@prisma/client';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { distanceKm, radiusBounds } from '../utils/distance.js';
import { AppError } from '../utils/response.js';

const mapDonationInclude = {
  owner: { select: { id: true, name: true } },
  images: { orderBy: { createdAt: 'asc' }, take: 1 },
};

const ROUTING_TIMEOUT_MS = 6000;
const ROUTING_MAX_ATTEMPTS = 2;

export async function listNearbyDonations({ latitude, longitude, radiusKm: radius, category }) {
  const now = new Date();

  await prisma.donation.updateMany({
    where: { status: DonationStatus.AVAILABLE, endDate: { lt: now } },
    data: { status: DonationStatus.EXPIRED },
  });

  const bounds = radiusBounds(latitude, longitude, radius);
  const donations = await prisma.donation.findMany({
    where: {
      status: DonationStatus.AVAILABLE,
      isHidden: false,
      startDate: { lte: now },
      endDate: { gte: now },
      latitude: { gte: bounds.minLat, lte: bounds.maxLat },
      longitude: { gte: bounds.minLng, lte: bounds.maxLng },
      ...(category ? { category: { equals: category, mode: 'insensitive' } } : {}),
    },
    include: mapDonationInclude,
  });

  return donations
    .map((donation) => ({
      ...donation,
      distanceKm: distanceKm(latitude, longitude, donation.latitude, donation.longitude),
    }))
    .filter((donation) => donation.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
async function fetchRoutingResponse(url, fetchImpl) {
  let lastError = null;

  for (let attempt = 1; attempt <= ROUTING_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(ROUTING_TIMEOUT_MS),
      });

      if (response.ok) return response;
      if (response.status >= 500 && attempt < ROUTING_MAX_ATTEMPTS) continue;

      throw new AppError(502, 'ROUTING_UNAVAILABLE', 'บริการคำนวณเส้นทางไม่พร้อมใช้งาน');
    } catch (error) {
      if (error instanceof AppError) throw error;
      lastError = error;
      if (attempt >= ROUTING_MAX_ATTEMPTS) break;
    }
  }

  const timedOut = lastError?.name === 'TimeoutError' || lastError?.name === 'AbortError';
  throw new AppError(
    timedOut ? 504 : 502,
    timedOut ? 'ROUTING_TIMEOUT' : 'ROUTING_UNAVAILABLE',
    timedOut ? 'บริการคำนวณเส้นทางใช้เวลาตอบสนองนานเกินไป' : 'ไม่สามารถเชื่อมต่อบริการคำนวณเส้นทางได้',
  );
}

export async function getDrivingRoute({ fromLat, fromLng, toLat, toLng }, fetchImpl = fetch) {
  const base = env.routingBaseUrl.replace(/\/$/, '');
  const coordinates = `${fromLng},${fromLat};${toLng},${toLat}`;
  const url = `${base}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;
  const response = await fetchRoutingResponse(url, fetchImpl);

  const data = await response.json();
  const route = data.routes?.[0];
  if (!route || data.code !== 'Ok') {
    throw new AppError(404, 'ROUTE_NOT_FOUND', 'ไม่พบเส้นทางไปยังจุดบริจาค');
  }

  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    geometry: route.geometry,
    steps: (route.legs?.[0]?.steps || []).map((step) => ({
      distanceMeters: step.distance,
      durationSeconds: step.duration,
      name: step.name || '',
      instruction: step.maneuver?.type || '',
      modifier: step.maneuver?.modifier || null,
      location: step.maneuver?.location || null,
    })),
  };
}
export async function getDonationDrivingRoute({ donationId, fromLat, fromLng }, fetchImpl = fetch) {
  const now = new Date();
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    select: {
      id: true,
      latitude: true,
      longitude: true,
      status: true,
      isHidden: true,
      startDate: true,
      endDate: true,
    },
  });

  if (!donation || donation.isHidden) {
    throw new AppError(404, 'DONATION_NOT_FOUND', 'ไม่พบโพสต์บริจาค');
  }

  if (donation.status === DonationStatus.AVAILABLE && donation.endDate < now) {
    await prisma.donation.update({
      where: { id: donation.id },
      data: { status: DonationStatus.EXPIRED },
    });
    donation.status = DonationStatus.EXPIRED;
  }

  const isActive = donation.status === DonationStatus.AVAILABLE
    && donation.startDate <= now
    && donation.endDate >= now;

  if (!isActive) {
    throw new AppError(409, 'DONATION_NOT_AVAILABLE', 'จุดบริจาคนี้ไม่อยู่ในช่วงที่สามารถนำทางได้');
  }

  return getDrivingRoute({
    fromLat,
    fromLng,
    toLat: donation.latitude,
    toLng: donation.longitude,
  }, fetchImpl);
}
