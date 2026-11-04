import { useCore } from '../data/core';
import { PRODUCT } from '../config';
import { ButtonLink } from '../components/ui/Button';
import { Kicker } from '../components/ui/SectionHeader';
import { formatDate, formatNumber } from '../lib/format';

const PRINCIPLES = [
  {
    title: 'Official sources',
    body: 'Every number links to the table it came from — publisher, table ID, reference period and the day we retrieved it.',
  },
  {
    title: 'Missing stays missing',
    body: 'When a source suppresses a value or never published it, you see the gap and the reason. Never a zero, never a guess.',
  },
  {
    title: 'Assumptions labelled',
    body: 'Anything we calculate is marked as an estimate with its method. Anything you type is marked as your input.',
  },
  {
    title: 'Honest geography',
    body: 'A Toronto figure describes the Toronto CMA, not Mississauga on its own. Regional and province-wide values say so.',
  },
];

export default function AboutPage() {
  const core = useCore();
  const mapLayers = core.metrics.filter((m) => m.mapLayer).length;
  return (
    <>
      <div className="page">
        <header className="editorial-hero">
          <Kicker>About {PRODUCT.name}</Kicker>
          <h1 className="display">A field guide to Canadian cities, built from the public record.</h1>
          <p className="dek">
            {PRODUCT.name} helps people deciding where to live in Canada compare places on the numbers that shape a household — rent, pay in your line of work, the
            job market, the cost of a basic basket, the climate and the immigration routes that apply — and it says plainly where the data runs out.
          </p>
        </header>

        <ul className="about-facts" aria-label="This snapshot">
          <li>
            <div className="stat stat--md">
              <span className="stat__label label">Places</span>
              <span className="stat__value num">{formatNumber(core.places.length)}</span>
            </div>
          </li>
          <li>
            <div className="stat stat--md">
              <span className="stat__label label">Map layers</span>
              <span className="stat__value num">{formatNumber(mapLayers)}</span>
            </div>
          </li>
          <li>
            <div className="stat stat--md">
              <span className="stat__label label">Sources</span>
              <span className="stat__value num">{formatNumber(core.sources.length)}</span>
              <span className="stat__meta">Snapshot built {formatDate(core.manifest.builtAt)}</span>
            </div>
          </li>
        </ul>

        <section className="about-cols" aria-labelledby="about-what">
          <h2 id="about-what" className="h3 about-cols__label">
            What it is
          </h2>
          <div className="prose">
            <p>
              An explorer, not an adviser. The map opens on {formatNumber(core.places.length)} metropolitan areas and larger towns, each measured the way its
              statistical agency measures it. Pick a measure, add your occupation, and the colours, the ranking and the profile pages all follow from the same
              published tables.
            </p>
            <p>
              Colour classes are fixed across every place for a measure, so filtering to a region never quietly redraws the scale. Wages are the medians of people
              already employed in an occupation in each economic region — not job-ad salaries — and the map tells you when a province-wide value stands in.
            </p>
          </div>
        </section>

        <section className="about-cols" aria-labelledby="about-who">
          <h2 id="about-who" className="h3 about-cols__label">
            Who it’s for
          </h2>
          <div className="prose">
            <p>
              Newcomers weighing a first destination, people already in Canada thinking about a move, and the settlement workers, employers and families who help
              them. It assumes no prior knowledge of Canadian statistics: every term on the map has a plain-English definition one click away.
            </p>
          </div>
        </section>

        <section className="about-cols" aria-labelledby="about-independence">
          <h2 id="about-independence" className="h3 about-cols__label">
            Independence
          </h2>
          <div className="prose">
            <p>
              This is an independent project. It is not affiliated with the Government of Canada or with any organisation whose data it uses, and nothing here is
              immigration or financial advice. There are no ads, accounts or tracking; saved places, comparisons and budget inputs stay in your browser.
            </p>
            <p>
              <ButtonLink to="/sources" variant="outline" iconRight="arrowRight">
                Sources & methods
              </ButtonLink>
            </p>
          </div>
        </section>
      </div>

      <section className="principles dark-band" aria-labelledby="about-principles">
        <div className="principles__inner">
          <Kicker>Data principles</Kicker>
          <h2 id="about-principles" className="h2" style={{ marginTop: 12 }}>
            Four rules every number follows.
          </h2>
          <ol className="principles__grid">
            {PRINCIPLES.map((p, i) => (
              <li key={p.title}>
                <p className="principles__num">0{i + 1}</p>
                <h3 className="principles__title">{p.title}</h3>
                <p className="principles__body">{p.body}</p>
              </li>
            ))}
          </ol>
          <p style={{ marginTop: 'var(--s-6)' }}>
            <ButtonLink to="/" variant="outline" icon="map">
              Explore the map
            </ButtonLink>
          </p>
        </div>
      </section>
    </>
  );
}
