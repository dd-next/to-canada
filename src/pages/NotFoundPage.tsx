import { useLocation } from 'react-router-dom';
import { ButtonLink } from '../components/ui/Button';
import { Kicker } from '../components/ui/SectionHeader';

export default function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <div className="page">
      <div className="notfound">
        <p className="notfound__code" aria-hidden="true">
          4<span>0</span>4
        </p>
        <div className="notfound__body">
          <Kicker>Off the map</Kicker>
          <h1 className="h1">This page isn’t on our map.</h1>
          <p className="dek">The address may be mistyped, or the page has moved. Every place we cover is one search away on the explorer.</p>
          <p className="notfound__path">{pathname}</p>
          <div className="cluster">
            <ButtonLink to="/" variant="primary" icon="map">
              Back to the map
            </ButtonLink>
            <ButtonLink to="/insights" variant="outline">
              Read the insights
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}
