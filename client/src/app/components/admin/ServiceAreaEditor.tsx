import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import '@geoman-io/leaflet-geoman-free';
import type { PM } from '@geoman-io/leaflet-geoman-free';
import { api } from '../../lib/api';

// Fix default Leaflet marker icons under Vite bundling
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface Coordinate {
  lat: number;
  lng: number;
}

interface ServiceAreaPayload {
  polygon: Coordinate[];
  studio_name: string;
  studio_address: string;
  studio_lat: number | null;
  studio_lng: number | null;
}

const OXFORD_CENTER: [number, number] = [51.7520, -1.2577];
const FONT = "'Helvetica Neue', Arial, sans-serif";

function PolygonEditor({
  initialPolygon,
  onSave,
}: {
  initialPolygon: Coordinate[];
  onSave: (polygon: Coordinate[]) => void;
}) {
  const map = useMap();
  const layerRef = useRef<L.Polygon | null>(null);

  useEffect(() => {
    map.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircle: false,
      drawText: false,
      dragMode: true,
      cutPolygon: false,
      rotateMode: false,
      drawPolygon: true,
      editMode: true,
      removalMode: true,
    });

    if (initialPolygon.length >= 3) {
      const latlngs = initialPolygon.map(p => L.latLng(p.lat, p.lng));
      const poly = L.polygon(latlngs, {
        color: '#111',
        fillColor: '#111',
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '6 4',
      }).addTo(map);
      layerRef.current = poly;
      (poly as unknown as { pm: PM.PMLayer }).pm.enable();
      map.fitBounds(poly.getBounds(), { padding: [40, 40] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on('pm:create', (e: any) => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
      }
      const newPoly = e.layer as L.Polygon;
      layerRef.current = newPoly;
      newPoly.setStyle({ color: '#111', fillColor: '#111', fillOpacity: 0.12, weight: 2, dashArray: '6 4' });
      (newPoly as unknown as { pm: PM.PMLayer }).pm.enable();
      map.pm.disableDraw();
    });

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      map.pm.removeControls();
      map.off('pm:create');
    };
  }, [map, initialPolygon]);

  const handleSave = () => {
    if (!layerRef.current) return;
    const latlngs = (layerRef.current.getLatLngs()[0] as L.LatLng[]);
    const coords: Coordinate[] = latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }));
    onSave(coords);
  };

  return (
    <button
      type="button"
      onClick={handleSave}
      style={{
        position: 'absolute', bottom: 16, right: 16, zIndex: 1000,
        padding: '12px 24px', background: '#111', color: '#fff',
        fontSize: 12, fontWeight: 700, letterSpacing: 2,
        textTransform: 'uppercase', border: 'none', cursor: 'pointer',
        fontFamily: FONT,
      }}
    >
      Save Zone
    </button>
  );
}

function StudioMarkerPicker({
  position,
  onPick,
}: {
  position: [number, number] | null;
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  if (!position) return null;
  return <Marker position={position} />;
}

function FitStudio({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, 15);
  }, [map, position]);
  return null;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: '1px solid rgba(0,0,0,0.12)', fontSize: 13,
  fontFamily: FONT, boxSizing: 'border-box', outline: 'none',
};

export function ServiceAreaEditor() {
  const [polygon, setPolygon] = useState<Coordinate[]>([]);
  const [studioName, setStudioName] = useState('');
  const [studioAddress, setStudioAddress] = useState('');
  const [studioLat, setStudioLat] = useState<number | null>(null);
  const [studioLng, setStudioLng] = useState<number | null>(null);
  const [savingStudio, setSavingStudio] = useState(false);
  const [savingZone, setSavingZone] = useState(false);
  const [savedStudio, setSavedStudio] = useState(false);
  const [savedZone, setSavedZone] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get<ServiceAreaPayload>('/service-area/')
      .then(data => {
        setPolygon(data.polygon ?? []);
        setStudioName(data.studio_name ?? '');
        setStudioAddress(data.studio_address ?? '');
        setStudioLat(data.studio_lat ?? null);
        setStudioLng(data.studio_lng ?? null);
      })
      .catch(() => setError('Could not load studio / area settings.'))
      .finally(() => setLoaded(true));
  }, []);

  const studioPos: [number, number] | null =
    studioLat != null && studioLng != null ? [studioLat, studioLng] : null;

  const handleSaveStudio = async () => {
    setSavingStudio(true);
    setSavedStudio(false);
    setError('');
    try {
      const data = await api.patch<ServiceAreaPayload>('/service-area/', {
        studio_name: studioName,
        studio_address: studioAddress,
        studio_lat: studioLat,
        studio_lng: studioLng,
      });
      setStudioName(data.studio_name ?? '');
      setStudioAddress(data.studio_address ?? '');
      setStudioLat(data.studio_lat ?? null);
      setStudioLng(data.studio_lng ?? null);
      setSavedStudio(true);
      setTimeout(() => setSavedStudio(false), 3000);
    } catch {
      setError('Failed to save studio location.');
    } finally {
      setSavingStudio(false);
    }
  };

  const handleSaveZone = async (coords: Coordinate[]) => {
    setSavingZone(true);
    setSavedZone(false);
    setError('');
    try {
      await api.patch('/service-area/', { polygon: coords });
      setPolygon(coords);
      setSavedZone(true);
      setTimeout(() => setSavedZone(false), 3000);
    } catch {
      setError('Failed to save service area zone.');
    } finally {
      setSavingZone(false);
    }
  };

  if (!loaded) {
    return <p style={{ fontSize: 13, color: '#888' }}>Loading…</p>;
  }

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Studio location */}
      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>Studio location</h2>
        <p style={{ fontSize: 13, color: '#666', lineHeight: 1.7, marginBottom: 16 }}>
          Set the studio address and place a pin on the map. Customers see this pin on the public Studio page.
          Click the map to place or move the marker.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: 6 }}>
              Studio name (optional)
            </label>
            <input
              value={studioName}
              onChange={e => setStudioName(e.target.value)}
              style={inputStyle}
              placeholder="e.g. Photolux Oxford Studio"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', marginBottom: 6 }}>
              Studio address
            </label>
            <textarea
              value={studioAddress}
              onChange={e => setStudioAddress(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Street, city, postcode"
            />
          </div>
        </div>

        <div style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', border: '1px solid #ddd', marginBottom: 12 }}>
          <MapContainer
            center={studioPos ?? OXFORD_CENTER}
            zoom={studioPos ? 15 : 12}
            style={{ height: 360, width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitStudio position={studioPos} />
            <StudioMarkerPicker
              position={studioPos}
              onPick={(lat, lng) => {
                setStudioLat(lat);
                setStudioLng(lng);
              }}
            />
          </MapContainer>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleSaveStudio}
            disabled={savingStudio}
            style={{
              padding: '12px 24px', background: savingStudio ? '#555' : '#111', color: '#fff',
              fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
              border: 'none', cursor: savingStudio ? 'default' : 'pointer', fontFamily: FONT,
            }}
          >
            {savingStudio ? 'Saving…' : 'Save Studio'}
          </button>
          {studioPos && (
            <button
              type="button"
              onClick={() => { setStudioLat(null); setStudioLng(null); }}
              style={{
                background: 'none', border: 'none', fontSize: 12, color: '#888',
                cursor: 'pointer', textDecoration: 'underline', fontFamily: FONT,
              }}
            >
              Clear pin
            </button>
          )}
          {savedStudio && <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>Studio saved</span>}
          {studioPos && (
            <span style={{ fontSize: 12, color: '#999' }}>
              {studioLat!.toFixed(5)}, {studioLng!.toFixed(5)}
            </span>
          )}
        </div>
      </section>

      {/* Future service area */}
      <section>
        <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>Service area (future)</h2>
        <p style={{ fontSize: 13, color: '#666', lineHeight: 1.7, marginBottom: 16 }}>
          Optional zone for a future home-visit offering. Not used for bookings today and not shown on the customer Studio page.
          Draw a polygon, then click <strong>Save Zone</strong>.
        </p>

        <div style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', border: '1px solid #ddd' }}>
          <MapContainer
            center={OXFORD_CENTER}
            zoom={12}
            style={{ height: 480, width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <PolygonEditor initialPolygon={polygon} onSave={handleSaveZone} />
          </MapContainer>
        </div>

        <div style={{ marginTop: 12, minHeight: 24 }}>
          {savingZone && <p style={{ fontSize: 13, color: '#555' }}>Saving…</p>}
          {savedZone && <p style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>Zone saved successfully</p>}
          {polygon.length > 0 && !savingZone && !savedZone && (
            <p style={{ fontSize: 12, color: '#999' }}>{polygon.length} points in current zone</p>
          )}
        </div>
      </section>

      {error && <p style={{ fontSize: 13, color: '#b91c1c', marginTop: 16 }}>{error}</p>}
    </div>
  );
}
