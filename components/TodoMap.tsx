'use client';

import { useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps';
import { TodoWithPlan } from '@/types';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const PIN_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#eab308',
  low: '#3b82f6',
  none: '#6366f1',
};

interface TodoMapProps {
  todos: TodoWithPlan[];
  selectedTodoId: string | null;
  onSelectTodo: (id: string) => void;
}

const FIT_PADDING = 48;
const SINGLE_POINT_ZOOM = 14;
const MAX_FIT_ZOOM = 15;
const FIT_ANIMATION_MS = 900;

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function mercatorY(lat: number) {
  const s = Math.sin((lat * Math.PI) / 180);
  return Math.log((1 + s) / (1 - s)) / 2;
}

// Camera (center + zoom) that frames the bounds with padding, mirroring what
// fitBounds would settle on — needed because fitBounds itself can't animate.
function cameraForBounds(
  map: google.maps.Map,
  bounds: google.maps.LatLngBounds,
  singlePoint: boolean
): { lat: number; lng: number; zoom: number } | null {
  const div = map.getDiv();
  const width = div.clientWidth;
  const height = div.clientHeight;
  if (!width || !height) return null;
  const center = bounds.getCenter();
  if (singlePoint) return { lat: center.lat(), lng: center.lng(), zoom: SINGLE_POINT_ZOOM };
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const latFraction = (mercatorY(ne.lat()) - mercatorY(sw.lat())) / Math.PI;
  let lngDiff = ne.lng() - sw.lng();
  if (lngDiff < 0) lngDiff += 360;
  const lngFraction = lngDiff / 360;
  const zoomForLat = Math.log2(Math.max(height - FIT_PADDING * 2, 1) / 256 / latFraction);
  const zoomForLng = Math.log2(Math.max(width - FIT_PADDING * 2, 1) / 256 / lngFraction);
  return { lat: center.lat(), lng: center.lng(), zoom: Math.min(zoomForLat, zoomForLng, MAX_FIT_ZOOM) };
}

// Encoded as a string key so the effect refits only when the set of points
// actually changes, not on every parent re-render.
function FitBounds({ positionsKey }: { positionsKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !positionsKey) return;
    const points = positionsKey.split('|').map((s) => {
      const [lat, lng] = s.split(',').map(Number);
      return { lat, lng };
    });
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));

    const jumpWithoutAnimation = () => {
      if (points.length === 1) {
        map.setCenter(points[0]);
        map.setZoom(SINGLE_POINT_ZOOM);
      } else {
        map.fitBounds(bounds, FIT_PADDING);
      }
    };

    const target = cameraForBounds(map, bounds, points.length === 1);
    const startCenter = map.getCenter();
    const startZoom = map.getZoom();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!target || !startCenter || startZoom == null || reducedMotion) {
      jumpWithoutAnimation();
      return;
    }

    const from = { lat: startCenter.lat(), lng: startCenter.lng(), zoom: startZoom };
    // Take the short way around the antimeridian.
    let lngDelta = target.lng - from.lng;
    if (lngDelta > 180) lngDelta -= 360;
    if (lngDelta < -180) lngDelta += 360;

    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - t0) / FIT_ANIMATION_MS, 1);
      const e = easeInOutCubic(t);
      map.moveCamera({
        center: {
          lat: from.lat + (target.lat - from.lat) * e,
          lng: from.lng + lngDelta * e,
        },
        zoom: from.zoom + (target.zoom - from.zoom) * e,
      });
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [map, positionsKey]);
  return null;
}

export default function TodoMap({ todos, selectedTodoId, onSelectTodo }: TodoMapProps) {
  if (!API_KEY) return null;

  const located = todos.filter((t) => t.locationLat != null && t.locationLng != null);
  // Fit the view around incomplete tasks; fall back to all pins when every task is done.
  const activeLocated = located.filter((t) => !t.completed);
  const positionsKey = (activeLocated.length > 0 ? activeLocated : located)
    .map((t) => `${t.locationLat},${t.locationLng}`)
    .join('|');

  return (
    <div className="mt-6 space-y-2">
      <h3 className="text-sm font-semibold text-gray-700 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-indigo-600" /> Task Locations
        </span>
        {located.length > 0 && (
          <span className="text-xs font-normal text-gray-400">
            {located.length} {located.length === 1 ? 'task' : 'tasks'} on the map
          </span>
        )}
      </h3>

      {located.length === 0 ? (
        <div className="h-32 flex items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white text-sm text-gray-400">
          No tasks with a location yet — add one in a task&apos;s details.
        </div>
      ) : (
        <div className="h-72 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
          <APIProvider apiKey={API_KEY}>
            <Map
              mapId="DEMO_MAP_ID"
              defaultCenter={{ lat: 20, lng: 0 }}
              defaultZoom={2}
              gestureHandling="cooperative"
              disableDefaultUI
              zoomControl
            >
              {located.map((t) => (
                <AdvancedMarker
                  key={t.id}
                  position={{ lat: t.locationLat!, lng: t.locationLng! }}
                  title={`${t.text}${t.location ? ` — ${t.location}` : ''}`}
                  zIndex={selectedTodoId === t.id ? 2 : 1}
                  onClick={() => onSelectTodo(t.id)}
                >
                  <Pin
                    background={t.completed ? '#9ca3af' : PIN_COLORS[t.priority] ?? PIN_COLORS.none}
                    borderColor="#ffffff"
                    glyphColor="#ffffff"
                    scale={selectedTodoId === t.id ? 1.3 : 1}
                  />
                </AdvancedMarker>
              ))}
              <FitBounds positionsKey={positionsKey} />
            </Map>
          </APIProvider>
        </div>
      )}
    </div>
  );
}
