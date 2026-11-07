import { Link } from 'react-router-dom';
import type { ServicesCatalogue } from '../../types/services';
import { serviceTimestamp } from './filter';

export default function ServicesFreshness({ meta }: { meta: ServicesCatalogue['meta'] }) {
  return <aside className="services__freshness" aria-label="Catalogue source and freshness">
    <p>From <a className="link" href="https://awesome-canada.ca/" target="_blank" rel="noopener noreferrer">Awesome Canada</a> by <a className="link" href="https://github.com/wra-sol" target="_blank" rel="noopener noreferrer">wra-sol</a> and contributors. <Link className="link" to="/services/sources">Sources & credits</Link></p>
    <p>Snapshot last checked: <strong>{serviceTimestamp(meta.lastSuccessfulCheckAt)}</strong> · Content last changed: {serviceTimestamp(meta.lastSuccessfulContentUpdateAt)}. <Link className="link" to="/services/updates">Update log</Link></p>
    {meta.status === 'failed' && <p className="services__notice" role="status"><strong>The latest source check failed.</strong> The last valid catalogue remains available. Attempted {serviceTimestamp(meta.lastAttemptedAt)}; see the update log for details.</p>}
  </aside>;
}
