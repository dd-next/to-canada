import { useCore } from '../../data/core';
import { ButtonLink } from '../ui/Button';

export function NeighbourhoodSection({ placeId, name }: { placeId: string; name: string }) {
  const { manifest } = useCore();
  const available = !!manifest.files[`neighbourhoods/${placeId}.json`];
  if (!available) return null;
  return (
    <div className="ppanel">
      <h3 className="h3">Find your corner of {name}.</h3>
      <p className="psec__dek">Explore local households, housing, public spaces and transport. Open a neighbourhood for its available data and local context.</p>
      <p className="ppanel__note">Neighbourhood coverage has its own geographic boundaries and source dates, shown on each profile.</p>
      <ButtonLink to={`/place/${placeId}/neighbourhoods`} variant="primary" icon="map">Explore neighbourhoods</ButtonLink>
    </div>
  );
}
