import { useCore } from '../../data/core';
import { ButtonLink } from '../ui/Button';

export function NeighbourhoodSection({ placeId, name }: { placeId: string; name: string }) {
  const { manifest } = useCore();
  const available = !!manifest.files[`neighbourhoods/${placeId}.json`];
  if (!available) return null;
  return (
    <div className="ppanel">
      <h3 className="h3">Find your corner of {name}.</h3>
      <p className="psec__dek">Explore local households, parkland and nearby LRT stations. Open a neighbourhood for the details and perspectives from residents.</p>
      <p className="ppanel__note">Within the City of {name}, rather than the whole metropolitan area. Census 2021; park and transit snapshots carry their own dates.</p>
      <ButtonLink to={`/place/${placeId}/neighbourhoods`} variant="primary" icon="map">Explore neighbourhoods</ButtonLink>
    </div>
  );
}
