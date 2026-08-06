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

/** Oxford railway station — public reference until admin sets a studio pin. */
const OXFORD_STATION: LatLngTuple = [51.7537, -1.2701];

interface StudioPayload {
  studio_name: string;
  studio_address: string;
  studio_lat: number | null;
  studio_lng: number | null;
}

function Recenter({ center, zoom }: { center: LatLngTuple; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
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

  const hasStudioPin = studio?.studio_lat != null && studio?.studio_lng != null;
  const center: LatLngTuple = hasStudioPin
    ? [studio!.studio_lat!, studio!.studio_lng!]
    : OXFORD_STATION;
  const zoom = hasStudioPin ? 15 : 15;

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
        zoom={zoom}
        className="service-area-map"
        style={{ height: 480, width: '100%', borderRadius: 4 }}
        scrollWheelZoom={false}
        zoomControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter center={center} zoom={zoom} />
        <Marker position={center}>
          <Popup>
            {hasStudioPin ? (
              <>
                <strong>Photolux Studio</strong>
                {studio!.studio_address && (
                  <>
                    <br />
                    {studio!.studio_address}
                  </>
                )}
              </>
            ) : (
              <>
                <strong>Oxford railway station</strong>
                <br />
                Photolux studio is two streets away — exact details after you request a quote.
              </>
            )}
          </Popup>
        </Marker>
      </MapContainer>

      <div style={{ marginTop: 12, fontSize: 12, color: '#777', lineHeight: 1.5 }}>
        {hasStudioPin
          ? (studio!.studio_address || 'Photolux Studio location')
          : 'Map pin: Oxford railway station (studio is nearby — full address on quote).'}
      </div>
    </div>
  );
}
