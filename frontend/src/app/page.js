import HomeMapClient from '../components/map/HomeMapClient';

const DEFAULT_RADIUS_KM = 5;
const MIN_RADIUS_KM = 0.5;
const MAX_RADIUS_KM = 500;

export default async function HomePage({ searchParams }) {
  const params = await searchParams;
  const category = typeof params?.category === 'string'
    ? params.category.slice(0, 60)
    : '';

  const requestedRadius = Number(params?.radius);
  const radiusKm = Number.isFinite(requestedRadius)
    && requestedRadius >= MIN_RADIUS_KM
    && requestedRadius <= MAX_RADIUS_KM
    ? requestedRadius
    : DEFAULT_RADIUS_KM;

  return (
    <HomeMapClient
      initialCategory={category}
      initialRadiusKm={radiusKm}
      clearReturnQuery={Boolean(params?.category || params?.radius)}
    />
  );
}
