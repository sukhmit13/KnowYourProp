import { memo, useEffect, useRef, useState } from 'react';
import Map, { Source, Layer, Marker, NavigationControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useZipPolygon, useCommunityAreaPolygon, useWardPolygon, useNeighborhoodPolygon, useTractPolygon } from '@/hooks/use-runs';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import type { MapRef } from 'react-map-gl/mapbox';

// Single source of truth for boundary colors — map layers AND legend swatches
// both read from here so they can never disagree.
export const MAP_COLORS = {
  zip: '#ef4444',
  community: '#3b82f6',
  neighborhood: '#059669',
  ward: '#8b5cf6',
  tract: '#000000',
  property: '#2b3a9e',
} as const;

interface PropertyMapProps {
  lat: number;
  lon: number;
  zipCode: string;
  communityArea: string;
  ward: string | null;
  address: string;
  neighborhood?: string | null;
  tractGeoid?: string | null;
}

function computeBbox(features: (GeoJSON.Feature | null | undefined)[]): [number, number, number, number] | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  let found = false;

  function processCoords(coords: any) {
    if (typeof coords[0] === 'number') {
      minLng = Math.min(minLng, coords[0]);
      minLat = Math.min(minLat, coords[1]);
      maxLng = Math.max(maxLng, coords[0]);
      maxLat = Math.max(maxLat, coords[1]);
      found = true;
    } else {
      coords.forEach(processCoords);
    }
  }

  for (const f of features) {
    if (!f?.geometry) continue;
    const geom = f.geometry as any;
    if (geom.coordinates) processCoords(geom.coordinates);
  }

  if (!found) return null;
  return [minLng, minLat, maxLng, maxLat];
}

export const PropertyMap = memo(function PropertyMap({ lat, lon, zipCode, communityArea, ward, address, neighborhood, tractGeoid }: PropertyMapProps) {
  const { data: zipPolygon } = useZipPolygon(zipCode);
  const { data: communityPolygon } = useCommunityAreaPolygon(communityArea);
  const { data: wardPolygon } = useWardPolygon(ward);
  const { data: neighborhoodPolygon } = useNeighborhoodPolygon(neighborhood);
  const { data: tractPolygon } = useTractPolygon(tractGeoid);
  const { data: tokenData } = useQuery<{ token: string }>({ queryKey: ['/api/config/mapbox-token'] });

  const mapRef = useRef<MapRef>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const isDifferentNeighborhood = neighborhood && neighborhood.toLowerCase() !== communityArea?.toLowerCase();
  const tractLabel = tractGeoid ? tractGeoid.slice(-6).replace(/^0+/, '') : null;

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    const features = [
      isDifferentNeighborhood ? neighborhoodPolygon : communityPolygon,
      zipPolygon,
      wardPolygon,
    ].filter(Boolean) as GeoJSON.Feature[];

    const bbox = computeBbox(features);
    if (bbox) {
      const [w, s, e, n] = bbox;
      const padded: [number, number, number, number] = [
        Math.min(w, lon) - 0.005,
        Math.min(s, lat) - 0.005,
        Math.max(e, lon) + 0.005,
        Math.max(n, lat) + 0.005,
      ];
      map.fitBounds([[padded[0], padded[1]], [padded[2], padded[3]]], { padding: 40, duration: 800 });
    }
  }, [mapLoaded, zipPolygon, communityPolygon, wardPolygon, neighborhoodPolygon, isDifferentNeighborhood, lat, lon]);

  // Only block render on missing token — polygons can load after map is live
  if (!tokenData) {
    return (
      <div className="w-full h-[400px] rounded-lg overflow-hidden">
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="print-only">
        <div className="mb-4 p-6 border-2 border-border rounded-lg" style={{ backgroundColor: '#f9fafb' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
            <div style={{ width: '48px', height: '48px', backgroundColor: '#0077b6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
          </div>
          <p style={{ fontSize: '20px', fontWeight: 'bold', textAlign: 'center', color: '#1f2937', marginBottom: '8px' }}>{address}</p>
          <p style={{ fontSize: '14px', textAlign: 'center', color: '#4b5563', marginBottom: '16px' }}>
            Coordinates: {lat.toFixed(6)}, {lon.toFixed(6)}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', fontSize: '14px' }}>
            {zipCode && <span style={{ color: '#374151' }}><strong>ZIP:</strong> {zipCode}</span>}
            {communityArea && <span style={{ color: '#374151' }}><strong>Community Area:</strong> {communityArea}</span>}
            {isDifferentNeighborhood && <span style={{ color: '#374151' }}><strong>Neighborhood:</strong> {neighborhood}</span>}
            {ward && <span style={{ color: '#374151' }}><strong>Ward:</strong> {ward}</span>}
          </div>
        </div>
      </div>

      <div className="screen-only lmap-frame">
        <Map
          ref={mapRef}
          mapboxAccessToken={tokenData.token}
          initialViewState={{ longitude: lon, latitude: lat, zoom: 15 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          scrollZoom={false}
          onLoad={() => setMapLoaded(true)}
        >
          <NavigationControl position="top-right" showCompass={false} />

          {communityPolygon && (
            <Source id="community" type="geojson" data={communityPolygon as any}>
              <Layer id="community-fill" type="fill" paint={{ 'fill-color': MAP_COLORS.community, 'fill-opacity': isDifferentNeighborhood ? 0.05 : 0.1 }} />
              <Layer id="community-line" type="line" paint={{ 'line-color': MAP_COLORS.community, 'line-width': isDifferentNeighborhood ? 2 : 3 }} />
            </Source>
          )}

          {neighborhoodPolygon && isDifferentNeighborhood && (
            <Source id="neighborhood" type="geojson" data={neighborhoodPolygon as any}>
              <Layer id="neighborhood-fill" type="fill" paint={{ 'fill-color': MAP_COLORS.neighborhood, 'fill-opacity': 0.12 }} />
              <Layer id="neighborhood-line" type="line" paint={{ 'line-color': MAP_COLORS.neighborhood, 'line-width': 3 }} />
            </Source>
          )}

          {zipPolygon && (
            <Source id="zip" type="geojson" data={zipPolygon as any}>
              <Layer id="zip-fill" type="fill" paint={{ 'fill-color': MAP_COLORS.zip, 'fill-opacity': 0.08 }} />
              <Layer id="zip-line" type="line" paint={{ 'line-color': MAP_COLORS.zip, 'line-width': 2.5 }} />
            </Source>
          )}

          {wardPolygon && (
            <Source id="ward" type="geojson" data={wardPolygon as any}>
              <Layer id="ward-fill" type="fill" paint={{ 'fill-color': MAP_COLORS.ward, 'fill-opacity': 0.05 }} />
              <Layer id="ward-line" type="line" paint={{ 'line-color': MAP_COLORS.ward, 'line-width': 2.5 }} />
            </Source>
          )}

          {tractPolygon && (
            <Source id="tract" type="geojson" data={tractPolygon as any}>
              <Layer id="tract-fill" type="fill" paint={{ 'fill-color': MAP_COLORS.tract, 'fill-opacity': 0.05 }} />
              <Layer id="tract-line" type="line" paint={{ 'line-color': MAP_COLORS.tract, 'line-width': 2.5 }} />
            </Source>
          )}

          <Marker longitude={lon} latitude={lat} anchor="bottom">
            <div style={{ width: 28, height: 28, backgroundColor: MAP_COLORS.property, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', border: '3px solid white', boxShadow: '0 2px 8px rgba(0,0,0,0.35)' }} title={address} />
          </Marker>
        </Map>
      </div>

      <div className="lmap-legwrap">
        <p className="lmap-legh">Map Legend</p>
        <div className="lmap-leg">
          {zipPolygon && (
            <span className="lmap-lgi"><span className="sw" style={{ borderColor: MAP_COLORS.zip }} />ZIP <b>{zipCode}</b></span>
          )}
          <span className="lmap-lgi"><span className="sw" style={{ borderColor: MAP_COLORS.community }} />Community <b>{communityArea}</b></span>
          {isDifferentNeighborhood && neighborhoodPolygon && (
            <span className="lmap-lgi"><span className="sw" style={{ borderColor: MAP_COLORS.neighborhood }} />Neighborhood <b>{neighborhood}</b></span>
          )}
          {ward && (
            <span className="lmap-lgi"><span className="sw" style={{ borderColor: MAP_COLORS.ward }} />Ward <b>{ward}</b></span>
          )}
          {tractPolygon && tractLabel && (
            <span className="lmap-lgi"><span className="sw" style={{ borderColor: MAP_COLORS.tract }} />Census Tract <b>{tractLabel}</b></span>
          )}
          <span className="lmap-lgi"><span className="dot" style={{ background: MAP_COLORS.property }} /><b>Property</b></span>
        </div>
      </div>
    </div>
  );
});
