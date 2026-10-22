'use client';

import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';

function routePositions(geometry) {
  if (!geometry?.coordinates?.length) return [];
  return geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}

export default function NavigationMap({
  from,
  to,
  geometry,
  recenterKey = 0,
  accuracy = null,
  activeNavigation = false,
  followUser = false,
  onUserMapInteraction,
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const overlayGroupRef = useRef(null);
  const animationFrameRef = useRef(null);
  const activeNavigationRef = useRef(activeNavigation);
  const interactionCallbackRef = useRef(onUserMapInteraction);
  const initialCenterRef = useRef(to);
  const positions = useMemo(() => routePositions(geometry), [geometry]);

  useEffect(() => {
    activeNavigationRef.current = activeNavigation;
    interactionCallbackRef.current = onUserMapInteraction;
  }, [activeNavigation, onUserMapInteraction]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    // Keep the Leaflet-owned element separate from React's stable host. During
    // Fast Refresh React can reuse the host while the previous Leaflet instance
    // is still cleaning up, which otherwise triggers "Map container is being
    // reused by another instance" and pane appendChild errors.
    const canvas = document.createElement('div');
    canvas.className = 'navigationLeafletCanvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    host.replaceChildren(canvas);

    const map = L.map(canvas, {
      center: initialCenterRef.current,
      zoom: 16,
      zoomControl: false,
      scrollWheelZoom: true,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const routePane = map.createPane('route-preview');
    routePane.style.zIndex = '430';
    overlayGroupRef.current = L.layerGroup().addTo(map);

    const handleDragStart = () => {
      if (activeNavigationRef.current) interactionCallbackRef.current?.();
    };
    map.on('dragstart', handleDragStart);

    animationFrameRef.current = window.requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
    });

    return () => {
      if (animationFrameRef.current != null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      map.off('dragstart', handleDragStart);
      overlayGroupRef.current = null;
      mapRef.current = null;
      map.remove();
      if (canvas.parentNode === host) canvas.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = overlayGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (positions.length > 1) {
      L.polyline(positions, {
        pane: 'route-preview',
        color: '#1e3a8a',
        weight: activeNavigation ? 12 : 11,
        opacity: 0.72,
      }).addTo(group);
      L.polyline(positions, {
        pane: 'route-preview',
        color: '#2563eb',
        weight: activeNavigation ? 6 : 5,
        opacity: 1,
      }).addTo(group);
    }

    L.circleMarker(to, {
      radius: 12,
      color: '#ffffff',
      fillColor: '#2563eb',
      fillOpacity: 0.96,
      weight: 3,
    })
      .bindTooltip('จุดรับของ', { permanent: true, direction: 'top', offset: [0, -10] })
      .addTo(group);

    if (from) {
      if (accuracy) {
        L.circle(from, {
          radius: accuracy,
          color: '#2563eb',
          fillColor: '#2563eb',
          fillOpacity: 0.07,
          weight: 1,
        }).addTo(group);
      }

      L.circleMarker(from, {
        radius: activeNavigation ? 11 : 10,
        color: '#0f172a',
        fillColor: '#ffffff',
        fillOpacity: 1,
        weight: 4,
      })
        .bindTooltip('ตำแหน่งฉัน', { permanent: !activeNavigation, direction: 'top', offset: [0, -9] })
        .addTo(group);
    }
  }, [positions, to, from, accuracy, activeNavigation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (activeNavigation) {
      if (followUser && from) {
        map.setView(from, Math.max(map.getZoom(), 17), { animate: true });
      }
      return;
    }

    if (positions.length > 1) {
      map.fitBounds(positions, {
        paddingTopLeft: [48, 120],
        paddingBottomRight: [48, 260],
        maxZoom: 17,
      });
      return;
    }

    if (from) {
      map.fitBounds([from, to], {
        paddingTopLeft: [48, 120],
        paddingBottomRight: [48, 260],
        maxZoom: 17,
      });
      return;
    }

    map.setView(to, 16);
  }, [to, from, positions, recenterKey, activeNavigation, followUser]);

  return (
    <div
      ref={hostRef}
      className={`navigationMapCanvas${activeNavigation ? ' activeNavigationMap' : ''}`}
      aria-label="แผนที่เส้นทางไปยังจุดรับของบริจาค"
    />
  );
}
