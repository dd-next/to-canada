import { useCore } from '../data/core';
import { CoverageMatrix } from '../components/sources/CoverageMatrix';
import { FreshnessTable } from '../components/sources/FreshnessTable';
import { SourceRegistry } from '../components/sources/SourceRegistry';
import { Badge } from '../components/ui/Badge';
import { SectionHeader } from '../components/ui/SectionHeader';
import { CalcBadge } from '../components/budget/Provenance';
import { formatDate } from '../lib/format';
import '../styles/sources.css';

export default function SourcesPage() {
  const core = useCore();
  const built = core.manifest.builtAt;
  return (
    <div className="page srcpage">
      <SectionHeader
        level={1}
        kicker="Sources and methods"
        title="Where the numbers come from"
        dek="Every figure in Northward is read from an official open dataset and keeps its source, period and geography. This page lists the sources, shows what is covered, and explains the rules we follow."
      />
      <nav className="srcpage__toc" aria-label="On this page">
        <a href="#freshness">Data freshness</a>
        <a href="#registry">Source registry</a>
        <a href="#coverage">Coverage</a>
        <a href="#methods">Methods</a>
        <a href="#refresh">Refresh the data</a>
      </nav>
      <p className="srcpage__built">
        Snapshot built {formatDate(built)} · {core.sources.length} sources · {core.places.length} places · {core.observations.length.toLocaleString('en-CA')} observations
      </p>

      {core.manifest.freshness && core.manifest.freshness.length > 0 && (
        <section id="freshness" className="srcpage__sec" aria-labelledby="freshness-h">
          <h2 id="freshness-h" className="h2">
            Data freshness
          </h2>
          <p className="srcpage__lede">
            The newest period in this snapshot for each kind of data, the date its publisher released it, and when we retrieved it. Publishers update on their own schedules (monthly, quarterly or yearly); the data is checked against the official sources every week.
          </p>
          <FreshnessTable entries={core.manifest.freshness} />
        </section>
      )}

      <section id="registry" className="srcpage__sec" aria-labelledby="registry-h">
        <h2 id="registry-h" className="h2">
          Source registry
        </h2>
        <p className="srcpage__lede">Each record shows the publisher, table, reference period, release and retrieval dates and licence, and what we did to the data.</p>
        <SourceRegistry sources={core.sources} />
      </section>

      <section id="coverage" className="srcpage__sec" aria-labelledby="coverage-h">
        <h2 id="coverage-h" className="h2">
          What is covered
        </h2>
        <p className="srcpage__lede">Coverage differs by place: smaller centres and the territories often have fewer published values. Gaps are shown as gaps, never filled in.</p>
        <CoverageMatrix core={core} />
      </section>

      <section id="methods" className="srcpage__sec" aria-labelledby="methods-h">
        <h2 id="methods-h" className="h2">
          Methods and cautions
        </h2>
        <div className="srcpage__methods prose">
          <h3>Geography</h3>
          <p>
            Statistics are published for statistical areas, not municipalities. A place such as Toronto means the Toronto census metropolitan area (CMA); Mississauga or Markham are search names inside it, not separate statistics. Smaller centres use census agglomerations (CA). Ottawa and Gatineau are the Ontario and Quebec parts of one CMA: we use part-level values where they are published, otherwise the whole-CMA value, labelled as such. Wages come from Job Bank for the primary <em>economic region</em> the place sits in. If a value describes a region or the province, the interface says so (“Regional value”, “Province-wide”) and never ranks it against local values.
          </p>
          <h3>Missing data</h3>
          <p>
            If a source does not publish a value, or suppresses it for confidentiality or reliability, it stays missing and the reason is shown. We do not fill gaps with zeros, averages or estimates from other places. Rankings and “best/worst” marks use only values for the same period and the same kind of geography.
          </p>
          <h3>Wages are not take-home pay</h3>
          <p>
            Job Bank wages are <em>gross</em> wages of people employed in an occupation, before income tax and deductions. They are not advertised pay and not take-home. Hourly medians become monthly gross pay with an explicit assumption of 37.5 paid hours a week × 52 weeks ÷ 12. The Budget calculator asks for your own take-home income and never uses a gross benchmark in its arithmetic.
          </p>
          <h3>Asking rent and paid rent</h3>
          <p>
            Asking rent is the advertised rent of units listed in a quarter; it is usually higher than what people already living in rental homes pay. Paid rent (and CMHC’s average rent) describe existing tenancies. They answer different questions, so they are shown separately and labelled, and one is never substituted for the other without saying so.
          </p>
          <h3>Price changes versus price levels</h3>
          <p>
            The Consumer Price Index measures how prices changed over time in each area. It says nothing about how expensive one place is compared with another. Use rent and basket values to compare levels, and CPI only to see change.
          </p>
          <h3>Cost benchmark (MBM)</h3>
          <p>
            The Market Basket Measure is Statistics Canada’s cost of a modest basket of food, clothing, transportation, shelter and other necessities, published for a reference family of four in each region. For the Budget page we exclude the shelter component, because rent is entered separately, and scale the others to your household with the square-root equivalence scale (cost for n people = cost for four × √n ÷ 2). It is a benchmark, not a forecast of what you would spend.
          </p>
          <h3>Immigration statistics and programs</h3>
          <p>
            Permanent-resident admissions and retention figures describe what happened to people who already immigrated; they are context for a place, not a promise about your own prospects. The Immigration directory summarises official program pages and links to them. It is reference information, not legal advice or an eligibility assessment; a status is shown only when it was verified on an official page on the date shown.
          </p>
          <h3>How assumptions are labelled</h3>
          <ul className="srcpage__legend">
            <li>
              <Badge variant="sourced" /> Read directly from an official source.
            </li>
            <li>
              <Badge variant="estimate" /> Derived from an official benchmark with an assumption we show.
            </li>
            <li>
              <CalcBadge /> A formula applied to sourced inputs, stated beside the result.
            </li>
            <li>
              <Badge variant="user" /> Typed by you; kept only in your browser unless you share a link.
            </li>
            <li>
              <Badge variant="regional" /> Measured for a broader area than the place.
            </li>
          </ul>
        </div>
      </section>

      <section id="refresh" className="srcpage__sec" aria-labelledby="refresh-h">
        <h2 id="refresh-h" className="h2">
          How to refresh the data
        </h2>
        <div className="prose">
          <p>
            The app reads a snapshot in <code>public/data/</code> built by the pipeline in <code>pipeline/</code>. From the repository root:
          </p>
          <pre className="srcpage__code">{`npm run data:refresh   # re-run every source pipeline, then rebuild the snapshot
npm run data:build     # rebuild the snapshot from data/processed/ only
npm run data:check     # validate the snapshot against the data contract
npm run data:freshness # compare each source with the publisher's latest release`}</pre>
          <p>
            If a source fails to download, its previously retrieved data is kept with its original retrieval date — a broken upstream never replaces good data with blanks. Set <code>NORTHWARD_REFRESH=1</code> to force fresh downloads instead of using cached files.
          </p>
        </div>
      </section>
    </div>
  );
}
