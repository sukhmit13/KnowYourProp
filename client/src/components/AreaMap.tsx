import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface AreaMapProps {
  type: 'zip' | 'community';
  id: string;
  sbifZones: Array<{ name: string }>;
  nmtcCoveragePct: number;
}

function useZipPolygon(zipCode: string) {
  return useQuery({
    queryKey: ['/api/polygons/zip', zipCode],
    queryFn: async () => {
      const res = await fetch(`/api/polygons/zip/${zipCode}`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!zipCode
  });
}

function useCommunityPolygon(name: string) {
  return useQuery({
    queryKey: ['/api/polygons/community', name],
    queryFn: async () => {
      const res = await fetch(`/api/polygons/community/${encodeURIComponent(name)}`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!name
  });
}

function useTifPolygons(tifNames: string[]) {
  return useQuery({
    queryKey: ['/api/tif-polygons', tifNames.join(',')],
    queryFn: async () => {
      if (tifNames.length === 0) return { type: 'FeatureCollection', features: [] };
      const res = await fetch(`/api/tif-polygons?names=${encodeURIComponent(tifNames.join(','))}`, { credentials: 'include' });
      if (!res.ok) return { type: 'FeatureCollection', features: [] };
      return res.json();
    },
    enabled: tifNames.length > 0
  });
}

function FitBounds({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [map, bounds]);
  
  return null;
}

export function AreaMap({ type, id, sbifZones, nmtcCoveragePct }: AreaMapProps) {
  const { data: zipPolygon, isLoading: isLoadingZip } = useZipPolygon(type === 'zip' ? id : '');
  const { data: communityPolygon, isLoading: isLoadingCommunity } = useCommunityPolygon(type === 'community' ? id : '');
  const tifNames = sbifZones.map(z => z.name);
  const { data: tifPolygons, isLoading: isLoadingTif } = useTifPolygons(tifNames);
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);

  const areaPolygon = type === 'zip' ? zipPolygon : communityPolygon;

  useEffect(() => {
    if (!areaPolygon?.geometry) return;
    
    const geoJsonLayer = L.geoJSON(areaPolygon as any);
    const newBounds = geoJsonLayer.getBounds();
    
    if (tifPolygons?.features?.length > 0) {
      const tifLayer = L.geoJSON(tifPolygons as any);
      newBounds.extend(tifLayer.getBounds());
    }
    
    setBounds(newBounds);
  }, [areaPolygon, tifPolygons]);

  const isLoading = (type === 'zip' && isLoadingZip) || (type === 'community' && isLoadingCommunity) || isLoadingTif;

  if (isLoading) {
    return (
      <div className="w-full h-[350px] rounded-lg overflow-hidden">
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  if (!areaPolygon) {
    return (
      <div className="w-full h-[350px] rounded-lg border border-border overflow-hidden bg-secondary flex items-center justify-center">
        <p className="text-muted-foreground">Map data not available</p>
      </div>
    );
  }

  const defaultCenter: [number, number] = [41.8781, -87.6298];

  return (
    <div className="w-full">
      <div className="h-[350px] rounded-lg overflow-hidden border border-border">
        <MapContainer
          center={defaultCenter}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
            maxZoom={20}
          />
          
          {areaPolygon && (
            <GeoJSON
              key={`area-${type}-${id}`}
              data={areaPolygon as any}
              style={{
                color: type === 'zip' ? '#ef4444' : '#3b82f6',
                weight: 3,
                fillColor: type === 'zip' ? '#ef4444' : '#3b82f6',
                fillOpacity: nmtcCoveragePct > 0 ? 0.1 + (nmtcCoveragePct / 400) : 0.1,
              }}
            />
          )}
          
          {tifPolygons?.features?.map((feature: any, index: number) => (
            <GeoJSON
              key={`tif-${index}-${feature.properties?.name || index}`}
              data={feature}
              style={{
                color: '#22c55e',
                weight: 2,
                fillColor: '#22c55e',
                fillOpacity: 0.2,
                dashArray: '4, 4',
              }}
            />
          ))}
          
          {bounds && <FitBounds bounds={bounds} />}
        </MapContainer>
      </div>
      
      <div className="mt-2 p-3 bg-secondary rounded-lg border border-border">
        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Map Legend</p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <div 
              className={`w-6 h-3 rounded-sm border-2 ${type === 'zip' ? 'bg-red-500/20 border-red-500' : 'bg-blue-500/20 border-blue-500'}`}
            />
            <span className="text-sm font-medium">
              {type === 'zip' ? `ZIP Code ${id}` : id}
            </span>
          </div>
          {sbifZones.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-3 bg-green-500/20 border-2 border-green-500 rounded-sm" style={{ borderStyle: 'dashed' }} />
              <span className="text-sm font-medium">SBIF/TIF Districts ({sbifZones.length})</span>
            </div>
          )}
          {nmtcCoveragePct > 0 && (
            <div className="flex items-center gap-2">
              <div 
                className={`w-6 h-3 rounded-sm border ${type === 'zip' ? 'bg-red-500/30 border-red-400' : 'bg-blue-500/30 border-blue-400'}`}
              />
              <span className="text-sm font-medium">NMTC Coverage: {nmtcCoveragePct}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
