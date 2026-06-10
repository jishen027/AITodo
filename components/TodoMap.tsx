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
    if (points.length === 1) {
      map.panTo(points[0]);
      map.setZoom(14);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);
  }, [map, positionsKey]);
  return null;
}

export default function TodoMap({ todos, selectedTodoId, onSelectTodo }: TodoMapProps) {
  if (!API_KEY) return null;

  const located = todos.filter((t) => t.locationLat != null && t.locationLng != null);
  const positionsKey = located.map((t) => `${t.locationLat},${t.locationLng}`).join('|');

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
