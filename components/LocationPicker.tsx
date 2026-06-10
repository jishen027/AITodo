'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin, X, ExternalLink } from 'lucide-react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMapsLibrary,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';

export interface LocationValue {
  location: string;
  locationLat: number | null;
  locationLng: number | null;
}

interface LocationPickerProps {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const inputClass =
  'w-full px-3 py-2 pr-8 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50';

function PickerBody({ value, onChange }: LocationPickerProps) {
  const places = useMapsLibrary('places');
  const geocoding = useMapsLibrary('geocoding');

  const [draft, setDraft] = useState(value.location);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [focused, setFocused] = useState(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  // Remembers the last string we tried to geocode so a failed lookup doesn't retry forever
  const lastGeocodedRef = useRef<string | null>(null);

  useEffect(() => setDraft(value.location), [value.location]);

  // Fetch autocomplete suggestions (debounced) while the user types
  useEffect(() => {
    if (!places || !focused || !draft.trim() || draft === value.location) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        sessionTokenRef.current ??= new places.AutocompleteSessionToken();
        const { suggestions: results } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: draft.trim(),
            sessionToken: sessionTokenRef.current,
          });
        setSuggestions(results);
      } catch (err) {
        console.error('[LocationPicker] autocomplete failed (is Places API (New) enabled?):', err);
        setSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, places, focused, value.location]);

  // Resolve coordinates for locations saved as plain text (typed manually or set by the AI)
  useEffect(() => {
    if (!geocoding || !value.location.trim() || value.locationLat != null) return;
    if (lastGeocodedRef.current === value.location) return;
    lastGeocodedRef.current = value.location;
    new geocoding.Geocoder()
      .geocode({ address: value.location })
      .then(({ results }) => {
        const loc = results[0]?.geometry.location;
        if (loc) onChange({ location: value.location, locationLat: loc.lat(), locationLng: loc.lng() });
      })
      .catch(() => {});
  }, [geocoding, value.location, value.locationLat, onChange]);

  const selectSuggestion = async (s: google.maps.places.AutocompleteSuggestion) => {
    const prediction = s.placePrediction;
    if (!prediction) return;
    const label = prediction.text.text;
    setSuggestions([]);
    setDraft(label);
    sessionTokenRef.current = null;
    lastGeocodedRef.current = label;
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['location'] });
      onChange({
        location: label,
        locationLat: place.location?.lat() ?? null,
        locationLng: place.location?.lng() ?? null,
      });
    } catch {
      onChange({ location: label, locationLat: null, locationLng: null });
    }
  };

  const commitDraft = () => {
    const text = draft.trim();
    if (text === value.location) return;
    lastGeocodedRef.current = null;
    onChange({ location: text, locationLat: null, locationLng: null });
  };

  const clearLocation = () => {
    setDraft('');
    setSuggestions([]);
    onChange({ location: '', locationLat: null, locationLng: null });
  };

  const handleMapClick = (e: MapMouseEvent) => {
    const ll = e.detail.latLng;
    if (!ll) return;
    const fallback = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
    if (!geocoding) {
      onChange({ location: fallback, locationLat: ll.lat, locationLng: ll.lng });
      return;
    }
    new geocoding.Geocoder()
      .geocode({ location: ll })
      .then(({ results }) => {
        const label = results[0]?.formatted_address ?? fallback;
        lastGeocodedRef.current = label;
        onChange({ location: label, locationLat: ll.lat, locationLng: ll.lng });
      })
      .catch(() => onChange({ location: fallback, locationLat: ll.lat, locationLng: ll.lng }));
  };

  const hasCoords = value.locationLat != null && value.locationLng != null;
  const position = hasCoords ? { lat: value.locationLat!, lng: value.locationLng! } : null;

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            // Delay so a click on a suggestion lands before the dropdown closes
            setTimeout(() => {
              setFocused(false);
              setSuggestions([]);
            }, 200);
            commitDraft();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { commitDraft(); setSuggestions([]); }
            if (e.key === 'Escape') { setDraft(value.location); setSuggestions([]); }
          }}
          placeholder="Search for a place or address..."
          className={inputClass}
        />
        {draft && (
          <button
            onClick={clearLocation}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-400 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            {suggestions.map((s, i) => (
              <li key={s.placePrediction?.placeId ?? i}>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(s)}
                  className="w-full flex items-start gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-indigo-50 transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                  <span className="truncate">{s.placePrediction?.text.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {position && (
        <div className="space-y-1.5">
          <div className="h-44 rounded-xl overflow-hidden border border-gray-200">
            <Map
              key={`${position.lat},${position.lng}`}
              mapId="DEMO_MAP_ID"
              defaultCenter={position}
              defaultZoom={15}
              gestureHandling="cooperative"
              disableDefaultUI
              zoomControl
              onClick={handleMapClick}
            >
              <AdvancedMarker position={position} />
            </Map>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Click the map to move the pin</span>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${position.lat},${position.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-indigo-500 hover:text-indigo-700 transition"
            >
              Open in Google Maps <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// Plain text input fallback so locations still work without a Maps API key
function PlainLocationInput({ value, onChange }: LocationPickerProps) {
  const [draft, setDraft] = useState(value.location);
  useEffect(() => setDraft(value.location), [value.location]);

  const commit = () => {
    const text = draft.trim();
    if (text !== value.location) onChange({ location: text, locationLat: null, locationLng: null });
  };

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          placeholder="Add a location..."
          className={inputClass}
        />
        {draft && (
          <button
            onClick={() => { setDraft(''); onChange({ location: '', locationLat: null, locationLng: null }); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-400 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400">
        Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map and place search.
      </p>
    </div>
  );
}

export default function LocationPicker(props: LocationPickerProps) {
  if (!API_KEY) return <PlainLocationInput {...props} />;
  return (
    <APIProvider apiKey={API_KEY}>
      <PickerBody {...props} />
    </APIProvider>
  );
}
