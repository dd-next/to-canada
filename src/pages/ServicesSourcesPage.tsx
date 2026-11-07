import { Link } from 'react-router-dom';
import { PRODUCT } from '../config';
import { useJSON } from '../data/useJSON';
import { formatNumber } from '../lib/format';
import { SectionHeader } from '../components/ui/SectionHeader';
import { Disclosure } from '../components/ui/Disclosure';
import { EmptyState } from '../components/ui/EmptyState';
import { serviceTimestamp } from '../components/services/filter';
import type { ServicesCatalogue } from '../types/services';
import '../styles/services.css';

export default function ServicesSourcesPage() {
  const feed = useJSON<ServicesCatalogue>('services/catalogue.json');
  const meta = feed.data?.meta;
  return <div className="page services services--sources">
    <SectionHeader level={1} kicker="Services" title="Sources & credits" dek="A community catalogue, with its original names, descriptions, categories and destinations preserved." />
    <section className="services__source-section" aria-labelledby="services-credit"><h2 className="h2" id="services-credit">Awesome Canada</h2>
      <p className="services__intro">This directory uses <a className="link" href="https://awesome-canada.ca/" target="_blank" rel="noopener noreferrer">Awesome Canada</a>, created by <a className="link" href="https://github.com/wra-sol" target="_blank" rel="noopener noreferrer">wra-sol</a> and its <a className="link" href="https://github.com/wra-sol/awesome-canada/graphs/contributors" target="_blank" rel="noopener noreferrer">contributors</a>. Their work brings services and resources across Canada into one open catalogue.</p>
      <p><a className="link" href="https://github.com/wra-sol/awesome-canada" target="_blank" rel="noopener noreferrer">Source repository</a> · <a className="link" href="https://awesome-canada.ca/" target="_blank" rel="noopener noreferrer">Project website</a> · <a className="link" href="https://github.com/wra-sol/awesome-canada/blob/main/data/resources.json" target="_blank" rel="noopener noreferrer">Original catalogue</a></p>
      {meta && <p className="services__fine">{meta.attribution}</p>}
    </section>
    {feed.loading && <p className="app-status" role="status">Loading source version and dates…</p>}
    {feed.error && <EmptyState title="Snapshot details could not be loaded"><p>The source links above remain available. Reload to try again.</p></EmptyState>}
    {meta && <>
      <section className="services__source-section" aria-labelledby="services-snapshot"><h2 className="h2" id="services-snapshot">The snapshot in Northward</h2>
        <dl className="services__facts">
          <div><dt>Last accepted source snapshot</dt><dd>{formatNumber(meta.counts.input)} input records accounted for</dd></div>
          <div><dt>Currently listed</dt><dd>{formatNumber(meta.counts.current)} entries across {formatNumber(meta.counts.categories)} categories and {formatNumber(meta.counts.jurisdictions)} source jurisdictions</dd></div>
          <div><dt>Retired records retained</dt><dd>{formatNumber(meta.counts.retired)}</dd></div>
          <div><dt>Latest attempt accounting</dt><dd>{meta.lastAttemptCounts ? `${formatNumber(meta.lastAttemptCounts.input)} input records; ${formatNumber(meta.lastAttemptCounts.valid)} valid; ${formatNumber(meta.lastAttemptCounts.quarantined)} quarantined` : 'The latest attempt did not produce a countable source snapshot'} · <a className="link" href={`${PRODUCT.dataBase}services/quarantine.json`}>Import report</a></dd></div>
          <div><dt>First imported here</dt><dd>{serviceTimestamp(meta.firstImportedAt)}</dd></div>
          <div><dt>Last successful source check</dt><dd>{serviceTimestamp(meta.lastSuccessfulCheckAt)}</dd></div>
          <div><dt>Last content update</dt><dd>{serviceTimestamp(meta.lastSuccessfulContentUpdateAt)}</dd></div>
          <div><dt>Latest attempt</dt><dd>{serviceTimestamp(meta.lastAttemptedAt)} · {meta.status === 'failed' ? 'Failed; prior snapshot retained' : meta.status === 'no_changes' ? 'No content changes' : 'Content updated'}</dd></div>
          <div><dt>Upstream version</dt><dd>{meta.source.commit ? <a className="link" href={`https://github.com/wra-sol/awesome-canada/commit/${encodeURIComponent(meta.source.commit)}`} target="_blank" rel="noopener noreferrer"><code>{meta.source.commit}</code></a> : 'No validated version imported yet'}</dd></div>
        </dl>
        {meta.status === 'failed' && meta.error && <p className="services__notice"><strong>Latest check failed; the prior valid snapshot is retained.</strong> {meta.error}</p>}
        {meta.warnings.length > 0 && <Disclosure summary={`Source and coverage notes (${meta.warnings.length})`}><ul className="services__notes">{meta.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></Disclosure>}
        <p className="services__fine">The catalogue is served from Northward’s validated snapshot. Browsing does not call GitHub or the source author’s maintenance service. <Link className="link" to="/services/updates">See checks and content history</Link>.</p>
      </section>
      <section className="services__source-section" aria-labelledby="services-license"><h2 className="h2" id="services-license">Licence and attribution</h2>
        <p>The Awesome Canada catalogue is shared under the {meta.license.name}. {meta.license.copyright}. The full notice is preserved with our copy.</p>
        <p><a className="link" href={`${PRODUCT.dataBase}services/LICENSE.txt`}>Read the full MIT licence and copyright notice</a> · <a className="link" href="https://github.com/wra-sol/awesome-canada/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">Upstream licence</a></p>
        <p>Linked websites, services and their datasets retain their own terms. A listing does not imply endorsement by Northward, Awesome Canada or the Government of Canada.</p>
      </section>
    </>}
    <section className="services__source-section" aria-labelledby="services-meaning"><h2 className="h2" id="services-meaning">What a listing tells you</h2>
      <ul className="services__notes">
        <li>Names, descriptions, categories, tags, level and jurisdiction come from Awesome Canada. English and French names remain as supplied; we do not generate translations.</li>
        <li>Coverage labels are a navigation aid based on source classification. Municipal coverage is distinct from a metropolitan area; regional and agency coverage may have their own limits. Unknown classifications stay reachable.</li>
        <li>Upstream “date added,” our first import, content changes and successful checks are separate dates. None is a verification of current eligibility, cost, language or availability.</li>
        <li>Northward does not independently check every destination’s reachability. A reachable page would not establish that its information or eligibility rules are current.</li>
        <li>Daily checks and manual refreshes validate complete snapshots before recording removals. Failed or suspicious checks retain the last valid catalogue; retired records remain available through their stable links and catalogue-status filter.</li>
      </ul>
      <p>For a specific service, follow its original destination and confirm the details with that provider.</p>
    </section>
  </div>;
}
