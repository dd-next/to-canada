import type { MultiPolygon, Polygon } from 'geojson';
import type { SourceRecord } from './contract';

export interface NeighbourhoodMetric {
  value: number | null;
  missingReason?: string;
}

export interface NeighbourhoodDefinition {
  label: string;
  unit: 'persons' | 'percent' | 'CAD_month' | 'count';
  sourceId: string;
  period: string;
  note: string;
  geographicScope?: string;
}

export interface NeighbourhoodStation {
  id: string;
  name: string;
  lon: number;
  lat: number;
  distanceToBoundaryM?: number;
}

export interface Neighbourhood {
  id: string;
  name: string;
  geometry: Polygon | MultiPolygon;
  metrics: Record<string, NeighbourhoodMetric>;
  parks: string[];
  stations: NeighbourhoodStation[];
  quality?: Record<string, string | null>;
  amenities?: { name: string; category: string; sourceId: string }[];
  description?: {
    verifiedAt: string;
    sections: { heading: string; text: string; kind: 'measured' | 'editorial'; sourceIds: string[] }[];
  };
}

export interface NeighbourhoodBundle {
  schemaVersion: 1;
  placeId: string;
  cityName: string;
  boundarySourceId: string;
  boundaryNote: string;
  boundaryVintage: string;
  coverageNote?: string;
  transportLabel?: string;
  definitions: Record<string, NeighbourhoodDefinition>;
  sources: SourceRecord[];
  neighbourhoods: Neighbourhood[];
  stations: NeighbourhoodStation[];
  links: { hoodmaps: string; reddit: string; profiles: string };
}
