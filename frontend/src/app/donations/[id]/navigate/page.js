'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import '../../../navigation-route.css';
import { api } from '../../../../lib/api';
import { canNavigateToDonation } from '../../../../lib/donationAvailability';

const NavigationMap = dynamic(() => import('../../../../components/map/NavigationMap'), { ssr: false });
const REROUTE_COOLDOWN_MS = 10000;

const OFF_ROUTE_MIN_METERS = 60;
const OFF_ROUTE_FIXES_REQUIRED = 2;

function formatDistance(meters) {
  if (meters == null || !Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.round(meters)} ม.`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} กม.`;
}

function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  if (seconds <= 0) return '0 นาที';
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  return remain ? `${hours} ชม. ${remain} นาที` : `${hours} ชม.`;
}
function geolocationMessage(error) {
  if (error?.code === 1) return 'กรุณาอนุญาต Location เพื่อใช้งานการนำทาง';
  if (error?.code === 2) return 'ไม่พบตำแหน่งปัจจุบัน กรุณาลองใหม่';
  if (error?.code === 3) return 'ค้นหาตำแหน่งนานเกินไป กรุณาลองใหม่';
  return 'ไม่สามารถอ่านตำแหน่งปัจจุบันได้';
}

function routeErrorMessage(error) {
  if (error?.code === 'DONATION_NOT_AVAILABLE') return 'จุดบริจาคนี้ไม่อยู่ในช่วงที่สามารถนำทางได้';
  if (error?.code === 'ROUTE_NOT_FOUND') return 'ไม่พบเส้นทางไปยังจุดบริจาคนี้';
  if (error?.code === 'ROUTING_TIMEOUT') return 'บริการคำนวณเส้นทางตอบสนองช้าเกินไป กรุณาลองอีกครั้ง';
  if (error?.code === 'ROUTING_UNAVAILABLE') return 'บริการคำนวณเส้นทางไม่พร้อมใช้งานชั่วคราว กรุณาลองอีกครั้ง';
  return 'คำนวณเส้นทางไม่สำเร็จ กรุณาลองอีกครั้ง';
}

function gpsQuality(accuracy) {
  if (accuracy == null) return { label: 'กำลังตรวจ', className: '' };
  if (accuracy <= 25) return { label: 'ดี', className: 'gpsGood' };
  if (accuracy <= 60) return { label: 'ปานกลาง', className: 'gpsFair' };
  return { label: 'ต่ำ', className: 'gpsPoor' };
}

function distanceMeters(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const toRad = (value) => (value * Math.PI) / 180;
  const earth = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
}

function pointToSegmentDistanceMeters(point, start, end) {
  const latRef = ((point[0] + start[0] + end[0]) / 3) * (Math.PI / 180);
  const metersPerLat = 111320;
  const metersPerLng = 111320 * Math.cos(latRef);
  const px = (point[1] - start[1]) * metersPerLng;
  const py = (point[0] - start[0]) * metersPerLat;
  const ex = (end[1] - start[1]) * metersPerLng;
  const ey = (end[0] - start[0]) * metersPerLat;
  const lengthSquared = ex * ex + ey * ey;
  if (!lengthSquared) return Math.hypot(px, py);
  const projection = Math.max(0, Math.min(1, (px * ex + py * ey) / lengthSquared));
  return Math.hypot(px - projection * ex, py - projection * ey);
}

function distanceToRoute(geometry, position) {
  const positions = routePositions(geometry);
  if (!positions.length || !position) return Number.POSITIVE_INFINITY;
  if (positions.length === 1) return distanceMeters(position, positions[0]);
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < positions.length - 1; index += 1) {
    nearest = Math.min(nearest, pointToSegmentDistanceMeters(position, positions[index], positions[index + 1]));
  }
  return nearest;
}

function routePositions(geometry) {
  if (!geometry?.coordinates?.length) return [];
  return geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}

function nearestGeometryIndex(positions, position, { minIndex = 0, maxIndex = positions.length - 1 } = {}) {
  if (!positions.length || !position) return 0;
  const start = Math.max(0, Math.min(minIndex, positions.length - 1));
  const end = Math.max(start, Math.min(maxIndex, positions.length - 1));
  let nearestIndex = start;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = start; index <= end; index += 1) {
    const distance = distanceMeters(position, positions[index]);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  }
  return nearestIndex;
}

const PROGRESS_LOOKAHEAD_POINTS = 120;

function routeProgressIndex(route, position, previousGeometryIndex = 0) {
  const positions = routePositions(route?.geometry);
  if (!positions.length || !position) return Math.max(0, previousGeometryIndex);
  const boundedPreviousIndex = Math.max(0, Math.min(previousGeometryIndex, positions.length - 1));
  return nearestGeometryIndex(positions, position, {
    minIndex: boundedPreviousIndex,
    maxIndex: boundedPreviousIndex + PROGRESS_LOOKAHEAD_POINTS,
  });
}

function remainingRouteMetrics(route, position, destination, previousGeometryIndex = 0) {
  if (!route || !position) {
    return { distanceMeters: route?.distanceMeters ?? null, durationSeconds: route?.durationSeconds ?? null, geometryIndex: 0 };
  }

  const positions = routePositions(route.geometry);
  if (distanceMeters(position, destination) <= 20) return { distanceMeters: 0, durationSeconds: 0, geometryIndex: Math.max(0, positions.length - 1) };
  if (positions.length < 2) return { distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds, geometryIndex: 0 };

  const nearestIndex = routeProgressIndex(route, position, previousGeometryIndex);
  let fullGeometryMeters = 0;
  let remainingGeometryMeters = distanceMeters(position, positions[nearestIndex]);

  for (let index = 0; index < positions.length - 1; index += 1) {
    const segment = distanceMeters(positions[index], positions[index + 1]);
    fullGeometryMeters += segment;
    if (index >= nearestIndex) remainingGeometryMeters += segment;
  }

  const ratio = fullGeometryMeters > 0
    ? Math.min(1, Math.max(0, remainingGeometryMeters / fullGeometryMeters))
    : 1;

  return {
    distanceMeters: Math.round(route.distanceMeters * ratio),
    durationSeconds: Math.round(route.durationSeconds * ratio),
    geometryIndex: nearestIndex,
  };
}
function stepPosition(step) {
  if (!Array.isArray(step?.location) || step.location.length < 2) return null;
  return [step.location[1], step.location[0]];
}
function nextManeuver(route, position, currentGeometryIndex) {
  if (!route?.steps?.length || !position) return null;
  const positions = routePositions(route.geometry);
  for (const step of route.steps) {
    const location = stepPosition(step);
    if (!location) continue;
    const stepIndex = nearestGeometryIndex(positions, location);
    const distance = distanceMeters(position, location);
    if (stepIndex < currentGeometryIndex) continue;
    if (stepIndex > currentGeometryIndex || distance > 25) return { ...step, distanceToManeuver: distance };
  }
  return null;
}

function maneuverIcon(step) {
  if (!step) return '↑';
  if (step.instruction === 'arrive') return '●';
  if (step.modifier?.includes('left')) return '↰';
  if (step.modifier?.includes('right')) return '↱';
  if (step.modifier === 'uturn') return '↶';
  return '↑';
}

function maneuverText(step) {
  if (!step) return 'ไปตามเส้นทาง';
  if (step.instruction === 'arrive') return 'ถึงจุดรับของบริจาค';
  const road = step.name ? ` เข้าสู่ ${step.name}` : '';
  if (step.modifier?.includes('left')) return `เลี้ยวซ้าย${road}`;
  if (step.modifier?.includes('right')) return `เลี้ยวขวา${road}`;
  if (step.modifier === 'uturn') return `กลับรถ${road}`;
  return `ตรงไป${road}`;
}

export default function NavigatePage() {
  const { id } = useParams();
  const [donation, setDonation] = useState(null);
  const [position, setPosition] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [route, setRoute] = useState(null);
  const [error, setError] = useState('');
  const [routeError, setRouteError] = useState('');
  const [routeBlocked, setRouteBlocked] = useState(false);
  const [donationLoading, setDonationLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);
  const [activeNavigation, setActiveNavigation] = useState(false);
  const [followUser, setFollowUser] = useState(true);
  const [offRoute, setOffRoute] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [rerouteError, setRerouteError] = useState('');
  const [recoveryNotice, setRecoveryNotice] = useState('');
  const [progressGeometryIndex, setProgressGeometryIndex] = useState(0);
  const autoLocateRef = useRef(false);
  const watchRef = useRef(null);
  const routeRequestedRef = useRef(false);
  const routeRequestInFlightRef = useRef(false);
  const routeRef = useRef(null);
  const activeNavigationRef = useRef(false);
  const progressGeometryIndexRef = useRef(0);
  const offRouteFixesRef = useRef(0);
  const reroutingRef = useRef(false);
  const rerouteCooldownRef = useRef(0);
  const recoveryTimerRef = useRef(null);
  useEffect(() => {
    let active = true;
    api(`/api/donations/${id}`)
      .then((result) => {
        if (active) {
          setDonation(result);
          setError('');
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || 'โหลดข้อมูลจุดบริจาคไม่สำเร็จ');
      })
      .finally(() => {
        if (active) setDonationLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  const calculateRoute = useCallback(async (current) => {
    if (!current || routeRequestInFlightRef.current) return false;

    const query = new URLSearchParams({
      donationId: String(id),
      fromLat: String(current[0]),
      fromLng: String(current[1]),
    });

    routeRequestInFlightRef.current = true;
    setRouteLoading(true);
    try {
      const result = await api(`/api/routes?${query}`);
      setRoute(result);
      routeRef.current = result;
      progressGeometryIndexRef.current = 0;
      setProgressGeometryIndex(0);
      routeRequestedRef.current = true;
      offRouteFixesRef.current = 0;
      setRouteBlocked(false);
      setOffRoute(false);
      setSheetCollapsed(false);
      return true;
    } catch (requestError) {
      const donationUnavailable = requestError.code === 'DONATION_NOT_AVAILABLE';
      const permanentFailure = donationUnavailable || requestError.code === 'ROUTE_NOT_FOUND';
      routeRequestedRef.current = true;
      offRouteFixesRef.current = 0;
      setRouteBlocked(donationUnavailable);
      setOffRoute(false);
      setSheetCollapsed(false);
      setRouteError(donationUnavailable ? '' : routeErrorMessage(requestError));

      if (permanentFailure) {
        setRoute(null);
        routeRef.current = null;
        setActiveNavigation(false);
        activeNavigationRef.current = false;
        setFollowUser(true);
      }
      return false;
    } finally {
      routeRequestInFlightRef.current = false;
      setRouteLoading(false);
    }
  }, [id]);


  const showRecoveryNotice = useCallback((message) => {
    setRecoveryNotice(message);
    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = setTimeout(() => setRecoveryNotice(''), 3500);
  }, []);

  const rerouteFromCurrent = useCallback(async (current) => {
    if (!current || reroutingRef.current) return;
    const query = new URLSearchParams({
      donationId: String(id),
      fromLat: String(current[0]),
      fromLng: String(current[1]),
    });

    reroutingRef.current = true;
    setRerouting(true);
    setRerouteError('');
    setSheetCollapsed(false);
    try {
      const result = await api(`/api/routes?${query}`);
      setRoute(result);
      routeRef.current = result;
      progressGeometryIndexRef.current = 0;
      setProgressGeometryIndex(0);
      routeRequestedRef.current = true;
      offRouteFixesRef.current = 0;
      setRouteBlocked(false);
      setOffRoute(false);
      setRerouteError('');
      showRecoveryNotice('ปรับเส้นทางแล้ว');
    } catch (requestError) {
      if (requestError.code === 'DONATION_NOT_AVAILABLE') {
        setRouteBlocked(true);
        setRoute(null);
        routeRef.current = null;
        progressGeometryIndexRef.current = 0;
        setProgressGeometryIndex(0);
        setActiveNavigation(false);
        activeNavigationRef.current = false;
        setOffRoute(false);
        setRerouteError('');
        setFollowUser(true);
      } else {
        setRerouteError(`${routeErrorMessage(requestError)} ยังใช้เส้นทางเดิมอยู่`);
      }
      setSheetCollapsed(false);
    } finally {
      reroutingRef.current = false;
      setRerouting(false);
    }
  }, [id, showRecoveryNotice]);

  const stopTracking = useCallback(() => {
    if (watchRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
    setTracking(false);
    setLocating(false);
  }, []);
  const startTracking = useCallback(() => {
    if (watchRef.current != null) return;
    if (!window.isSecureContext) {
      setSheetCollapsed(false);
      setError('การใช้ตำแหน่งปัจจุบันต้องเปิดผ่าน HTTPS หรือ localhost');
      return;
    }
    if (!navigator.geolocation) {
      setSheetCollapsed(false);
      setError('Browser นี้ไม่รองรับการอ่านตำแหน่ง');
      return;
    }

    setLocating(true);
    setError('');
    watchRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const current = [coords.latitude, coords.longitude];
        const currentAccuracy = Math.round(coords.accuracy);
        setPosition(current);
        setAccuracy(currentAccuracy);
        setLocating(false);
        setTracking(true);
        setError('');
        if (activeNavigationRef.current && routeRef.current) {
          const nextProgressIndex = routeProgressIndex(routeRef.current, current, progressGeometryIndexRef.current);
          progressGeometryIndexRef.current = nextProgressIndex;
          setProgressGeometryIndex(nextProgressIndex);
          if (currentAccuracy > 60) {
            offRouteFixesRef.current = 0;
            setOffRoute(false);
          } else {
            const threshold = Math.max(OFF_ROUTE_MIN_METERS, currentAccuracy * 2);
            const deviation = distanceToRoute(routeRef.current.geometry, current);
            if (deviation <= threshold) {
              offRouteFixesRef.current = 0;
              setOffRoute(false);
              setRerouteError('');
            } else {
              offRouteFixesRef.current += 1;
              if (offRouteFixesRef.current >= OFF_ROUTE_FIXES_REQUIRED) {
                setOffRoute(true);
                setSheetCollapsed(false);
                const now = Date.now();
                if (!reroutingRef.current && now >= rerouteCooldownRef.current) {
                  rerouteCooldownRef.current = now + REROUTE_COOLDOWN_MS;
                  rerouteFromCurrent(current);
                }
              }
            }
          }
        } else {
          offRouteFixesRef.current = 0;
          setOffRoute(false);
        }
        if (!routeRequestedRef.current) {
          routeRequestedRef.current = true;
          calculateRoute(current);
        }
      },
      (geoError) => {
        const wasActive = activeNavigationRef.current;
        const permissionDenied = geoError?.code === 1;
        setLocating(false);
        setSheetCollapsed(false);
        setError(geolocationMessage(geoError));

        // A timeout or temporarily unavailable GPS fix is recoverable. Keep the
        // watch alive so the next position can resume navigation automatically.
        if (!permissionDenied) return;

        stopTracking();
        setFollowUser(false);
        if (!wasActive) {
          setPosition(null);
          setAccuracy(null);
          setRoute(null);
          routeRef.current = null;
          routeRequestedRef.current = false;
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, [calculateRoute, rerouteFromCurrent, stopTracking]);
  useEffect(() => () => {
    stopTracking();
    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
  }, [stopTracking]);


  const navigable = canNavigateToDonation(donation) && !routeBlocked;
  useEffect(() => {
    if (!donation || !navigable || autoLocateRef.current) return;
    autoLocateRef.current = true;
    startTracking();
  }, [donation, navigable, startTracking]);

  function retryLocationAndRoute() {
    offRouteFixesRef.current = 0;
    rerouteCooldownRef.current = 0;
    setOffRoute(false);
    setRerouteError('');
    setRecoveryNotice('');
    setRouteError('');
    setFollowUser(true);
    if (!position) {
      stopTracking();
      routeRequestedRef.current = false;
      startTracking();
    } else if (watchRef.current == null) {
      routeRequestedRef.current = false;
      startTracking();
    } else {
      routeRequestedRef.current = true;
      calculateRoute(position);
    }
  }
  function retryGpsTracking() {
    setError('');
    setFollowUser(true);
    startTracking();
  }

  function retryReroute() {
    if (!position || reroutingRef.current) return;
    rerouteCooldownRef.current = Date.now() + REROUTE_COOLDOWN_MS;
    rerouteFromCurrent(position);
  }

  function startActiveNavigation() {
    if (!navigable || !route || !position || !tracking) return;
    activeNavigationRef.current = true;
    progressGeometryIndexRef.current = 0;
    setProgressGeometryIndex(0);
    offRouteFixesRef.current = 0;
    rerouteCooldownRef.current = 0;
    setOffRoute(false);
    setRerouteError('');
    setRecoveryNotice('');
    setActiveNavigation(true);
    setFollowUser(true);
    setSheetCollapsed(false);
    setRecenterKey((value) => value + 1);
  }

  function stopActiveNavigation() {
    activeNavigationRef.current = false;
    progressGeometryIndexRef.current = 0;
    setProgressGeometryIndex(0);
    offRouteFixesRef.current = 0;
    rerouteCooldownRef.current = 0;
    reroutingRef.current = false;
    setRerouting(false);
    setOffRoute(false);
    setRerouteError('');
    setRecoveryNotice('');
    setActiveNavigation(false);
    setFollowUser(true);
    setSheetCollapsed(false);
    setRecenterKey((value) => value + 1);
  }

  function recenter() {
    if (!position) {
      startTracking();
      return;
    }
    setFollowUser(true);
    setRecenterKey((value) => value + 1);
  }
  if (donationLoading) {
    return <main className="navStandaloneState"><div className="navStateCard">กำลังเปิดโหมดนำทาง...</div></main>;
  }
  if (!donation) {
    return (
      <main className="navStandaloneState">
        <div className="navStateCard">
          <div className="navStateError">{error || 'ไม่พบจุดบริจาคนี้'}</div>
          <Link href="/" className="navStateButton">← กลับแผนที่</Link>
        </div>
      </main>
    );
  }

  const destination = [donation.latitude, donation.longitude];
  const unavailableMessage = !navigable ? 'จุดบริจาคนี้ไม่อยู่ในช่วงที่สามารถนำทางได้' : '';
  const statusMessage = unavailableMessage || error;
  const preparing = locating || routeLoading;
  const quality = gpsQuality(accuracy);
  const liveMetrics = activeNavigation
    ? remainingRouteMetrics(route, position, destination, progressGeometryIndex)
    : { distanceMeters: route?.distanceMeters ?? null, durationSeconds: route?.durationSeconds ?? null, geometryIndex: 0 };
  const arrived = activeNavigation && liveMetrics.distanceMeters != null && liveMetrics.distanceMeters <= 20;
  const currentManeuver = activeNavigation && !arrived
    ? nextManeuver(route, position, liveMetrics.geometryIndex)
    : null;
  const maneuverDistance = arrived ? '0 ม.' : formatDistance(currentManeuver?.distanceToManeuver);
  const maneuverInstruction = arrived ? 'ถึงจุดรับของบริจาคแล้ว' : maneuverText(currentManeuver);
  const heading = locating
    ? 'กำลังหาตำแหน่ง...'
    : routeLoading
      ? 'กำลังคำนวณเส้นทาง...'
      : route
        ? formatDuration(route.durationSeconds)
        : routeError
          ? 'คำนวณเส้นทางไม่สำเร็จ'
          : 'เตรียมเส้นทาง';

  return (
    <main className={`navExperience${activeNavigation ? ' navActiveExperience' : ''}`}>
      <section className="navMapStage" aria-label="แผนที่นำทาง">
        <NavigationMap
          from={position}
          to={destination}
          geometry={route?.geometry || null}
          recenterKey={recenterKey}
          accuracy={accuracy}
          activeNavigation={activeNavigation}
          followUser={followUser}
          onUserMapInteraction={() => setFollowUser(false)}
        />

        {activeNavigation ? (
          <div className="navActiveTopBar" aria-label="คำแนะนำการนำทาง">
            <div className={`navManeuverIcon${arrived ? ' arrived' : ''}`} aria-hidden="true">{arrived ? 'ถึง' : maneuverIcon(currentManeuver)}</div>
            <div className="navManeuverCopy">
              <small>{arrived ? 'จุดหมาย' : maneuverDistance}</small>
              <strong>{rerouting ? 'กำลังปรับเส้นทาง...' : maneuverInstruction}</strong>
            </div>
          </div>
        ) : (
          <div className="navTopBar navTopBarSimple">
            <Link href={`/donations/${id}`} className="navRoundButton" aria-label="กลับหน้ารายละเอียด">←</Link>
            <div className="navDestinationCompact">
              <span>จุดหมาย</span>
              <strong>{donation.address || donation.title}</strong>
            </div>
          </div>
        )}
        <div className="navMapControls">
          <button
            type="button"
            className={`navMapButton${activeNavigation && !followUser ? ' navRecenterNeeded' : ''}`}
            aria-label={position ? 'กลับไปตำแหน่งปัจจุบัน' : 'ค้นหาตำแหน่งปัจจุบัน'}
            disabled={locating}
            onClick={recenter}
          ><span className="navRecenterIcon" aria-hidden="true" /></button>
        </div>
      </section>

      <section className={`navBottomSheet navBottomSheetSimple${activeNavigation ? ' navActiveSheet' : ''}${sheetCollapsed ? ' navSheetCollapsed' : ''}`} aria-label="ข้อมูลเส้นทาง">
        <button
          type="button"
          className="navSheetHandleButton"
          aria-label={sheetCollapsed ? 'ขยายแผงข้อมูล' : 'ย่อแผงข้อมูล'}
          aria-expanded={!sheetCollapsed}
          onClick={() => setSheetCollapsed((value) => !value)}
        ><span className="navSheetHandle" /></button>

        <div className="navSheetHeader navSheetHeaderSimple">
          <div>
            <span className="navEyebrow">{activeNavigation ? 'กำลังนำทาง' : 'เส้นทาง'}</span>
            <h1>{activeNavigation ? formatDuration(liveMetrics.durationSeconds) : heading}</h1>
            {!activeNavigation && !route && (
              <p>{statusMessage || (routeError ? 'เส้นทางยังไม่พร้อม กรุณาลองอีกครั้ง' : 'ใช้ตำแหน่งปัจจุบันเพื่อคำนวณเส้นทางไปยังจุดรับของ')}</p>
            )}
          </div>
          {route && <div className="navDistanceSummary"><strong>{formatDistance(liveMetrics.distanceMeters)}</strong><span>{activeNavigation ? 'เหลือ' : 'ระยะทาง'}</span></div>}
        </div>

        {statusMessage && <div className="navInlineNotice routeErrorNotice" role="status">{statusMessage}</div>}
        {routeError && !activeNavigation && <div className="navInlineNotice routeErrorNotice" role="status">{routeError}<button type="button" className="navInlineRetry" onClick={retryLocationAndRoute}>ลองอีกครั้ง</button></div>}
        {activeNavigation && offRoute && !rerouting && !rerouteError && <div className="navInlineNotice navOffRouteNotice" role="status">ออกจากเส้นทาง กำลังปรับเส้นทางใหม่</div>}
        {rerouteError && <div className="navInlineNotice routeErrorNotice" role="status">{rerouteError}<button type="button" className="navInlineRetry" onClick={retryReroute}>ลองอีกครั้ง</button></div>}
        {recoveryNotice && <div className="navInlineNotice navRecoveryNotice" role="status">{recoveryNotice}</div>}

        {!sheetCollapsed && position && accuracy != null && (
          <div className={`navGpsPill ${quality.className}`}><span>GPS {quality.label}{tracking ? ' · กำลังติดตาม' : ''}</span><strong>±{accuracy} ม.</strong></div>
        )}

        <div className="navPrimaryActions navPrimaryActionsSimple">
          {activeNavigation ? (
            tracking ? (
              <button type="button" className="navStartButton navStopButton" onClick={stopActiveNavigation}>สิ้นสุดการนำทาง</button>
            ) : (
              <>
                <button type="button" className="navStartButton" onClick={retryGpsTracking} disabled={locating}>
                  {locating ? 'กำลังหา GPS...' : 'ลอง GPS อีกครั้ง'}
                </button>
                <button type="button" className="navSecondaryButton" onClick={stopActiveNavigation}>สิ้นสุด</button>
              </>
            )
          ) : navigable && route && position && tracking ? (
            <button type="button" className="navStartButton" onClick={startActiveNavigation}>เริ่มนำทาง</button>
          ) : navigable ? (
            <button type="button" className="navStartButton" onClick={retryLocationAndRoute} disabled={preparing}>
              {locating ? 'กำลังหาตำแหน่ง...' : routeLoading ? 'กำลังคำนวณเส้นทาง...' : routeError ? 'ลองคำนวณเส้นทางอีกครั้ง' : 'ลองตำแหน่งอีกครั้ง'}
            </button>
          ) : (
            <button type="button" className="navStartButton" disabled>ไม่สามารถนำทางได้</button>
          )}
        </div>
      </section>
    </main>
  );
}