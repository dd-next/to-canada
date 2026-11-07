import type { Neighbourhood, NeighbourhoodBundle } from '../../types/neighbourhoods';

export function hasProfile(n: Neighbourhood) {
  return Object.values(n.metrics).some(m => m.value != null) || !!n.description?.sections.length || !!n.amenities?.length;
}

export function mapLayers(bundle: NeighbourhoodBundle) {
  const preferred = ['parkland', 'livingAlone', 'renters', 'apartments', 'lowRiseApartments', 'rail', 'parks', 'busStops', 'tramStops', 'population'];
  return preferred.filter(key => bundle.definitions[key] && bundle.neighbourhoods.some(n => n.metrics[key]?.value != null));
}
