import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { api } from '../lib/api';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

type LatLngTuple = [number, number];

const OXFORD_CENTER: LatLngTuple = [51.7520, -1.2577];

interface StudioPayload {
  studio_name: string;
  studio_address: string;
  studio_lat: number | null;
  studio_lng: number | null;
}

function Recenter({ center }: { center: LatLngTuple }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 15);
  }, [map, center]);
  return null;
}

export function ServiceAreaMap() {
  const [studio, setStudio] = useState<StudioPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<StudioPayload>('/service-area/')
      .then(data => setStudio({
        studio_name: data.studio_name ?? '',
        studio_address: data.studio_address ?? '',
        studio_lat: data.studio_lat ?? null,
        studio_lng: data.studio_lng ?? null,
      }))
      .catch(() => setStudio(null))
      .finally(() => setLoading(false));
  }, []);

  const hasPin = studio?.studio_lat != null && studio?.studio_lng != null;
  const center: LatLngTuple = hasPin
    ? [studio!.studio_lat!, studio!.studio_lng!]
    : OXFORD_CENTER;

  return (
    <div style={{ position: 'relative' }}>
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, fontSize: 13, color: '#888', letterSpacing: 1,
        }}>
          Loading map…
        </div>
      )}
      <MapContainer
        center={center}
        zoom={hasPin ? 15 : 12}
        className="service-area-map"
        style={{ height: 480, width: '100%', borderRadius: 4 }}
        scrollWheelZoom={false}
        zoomControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {hasPin && (
          <>
            <Recenter center={center} />
            <Marker position={center}>
              <Popup>
                <strong>{studio!.studio_name || 'Photolux Oxford Studio'}</strong>
                {studio!.studio_address && (
                  <>
                    <br />
                    {studio!.studio_address}
                  </>
                )}
              </Popup>
            </Marker>
          </>
        )}
      </MapContainer>

      <div style={{ marginTop: 12, fontSize: 12, color: '#777', lineHeight: 1.5 }}>
        {hasPin
          ? (studio!.studio_address || studio!.studio_name || 'Photolux Oxford studio location')
          : 'Studio location coming soon — check back shortly.'}
      </div>
    </div>
  );
}
