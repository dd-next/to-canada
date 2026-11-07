import { Link } from 'react-router-dom';
import { CRS_RULES, type CrsAssessment } from '../../model/crs';
import { formatDate } from '../../lib/format';

function Rows({ rows }: { rows: [string, number][] }) {
  return <dl className="crs__rows">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="num">{value}</dd></div>)}</dl>;
}

export function CrsResults({ assessment }: { assessment: CrsAssessment }) {
  const score = assessment.status === 'complete' ? assessment.score : null;
  return (
    <aside className="crs__results" aria-labelledby="crs-result-title">
      <div className="crs__total">
        <h2 id="crs-result-title" className="label">Your estimated CRS score</h2>
        <div role="status" aria-live="polite" aria-atomic="true">
          <p className="crs__number num" data-testid="crs-total">{score ? score.total.toLocaleString('en-CA') : '—'}<span> / 1,270</span></p>
          <p className="crs__total-note">{score ? (score.withSpouse ? 'With an accompanying spouse or partner' : 'Without accompanying-spouse points') : assessment.status === 'invalid' ? 'A score cannot be calculated yet.' : 'Complete your profile to see your score.'}</p>
        </div>
        {score && <a href="#crs-breakdown" className="crs__breakdown-link">See how your score adds up ↓</a>}
      </div>

      {assessment.status === 'incomplete' && <div className="crs__result-body">
        <p><strong>{assessment.missing.length} {assessment.missing.length === 1 ? 'answer' : 'answers'} still needed</strong></p>
        <p className="crs__hint">Unanswered questions do not count as zero.</p>
        <ul className="crs__missing">{assessment.missing.slice(0, 5).map((m) => <li key={m.id}><a href={`#${m.id}`} onClick={() => document.getElementById(m.id)?.focus()}>{m.label}</a></li>)}</ul>
        {assessment.missing.length > 5 && <p className="crs__hint">And {assessment.missing.length - 5} more; the list updates as you answer.</p>}
      </div>}
      {assessment.status === 'invalid' && <div className="crs__result-body" role="alert">{assessment.messages.map((m) => <p key={m}>{m}</p>)}<a href={CRS_RULES.language} target="_blank" rel="noreferrer">Language test requirements</a></div>}

      {score && <div id="crs-breakdown" className="crs__result-body">
        {score.calculatorDifferences.length > 0 && <div className="crs__note" role="note">
          <strong>Published rules vs. the web calculator</strong>
          <p>Published CRS criteria: <strong>{score.total}</strong>. IRCC web calculator: <strong>{score.officialCalculatorTotal}</strong> (checked {formatDate(CRS_RULES.checked)}).</p>
          {score.calculatorDifferences.map((message) => <p key={message}>{message}</p>)}
          {score.total === score.officialCalculatorTotal && <p>The additional-points cap makes the final totals equal for this profile.</p>}
          <a href={CRS_RULES.criteria} target="_blank" rel="noreferrer">Read the published criteria</a>
        </div>}
        <section className="crs__result-section">
          <h3>A. Core / human capital <span className="num">{score.core.total}</span></h3>
          <p className="crs__hint">Maximum {score.withSpouse ? 530 : 570}</p>
          <Rows rows={[
            ['Age', score.core.age], ['Education', score.core.education],
            ['First official language', score.core.firstLanguage], ['Second official language', score.core.secondLanguage],
            ['Labour market integration', score.core.labourMarket],
          ]} />
          <details className="crs__details">
            <summary>How the labour market factor works</summary>
            <Rows rows={[
              ['Canadian work-length points', score.labourMarket.workLength],
              ['High-wage experience points', score.labourMarket.highWageExperience],
              ['Canadian experience total', score.labourMarket.experienceTotal],
              ['High-wage job offer', score.labourMarket.jobOffer],
            ]} />
            <p>The higher of Canadian experience ({score.labourMarket.experienceTotal}) and the job offer ({score.labourMarket.jobOffer}) counts: <strong>{score.core.labourMarket} points</strong>. They are not added together.</p>
          </details>
        </section>
        <section className="crs__result-section">
          <h3>B. Spouse / partner <span className="num">{score.spouse.total}</span></h3>
          <p className="crs__hint">{score.withSpouse ? 'Maximum 40' : 'Not applicable to this profile'}</p>
          {score.withSpouse && <Rows rows={[
            ['Education', score.spouse.education], ['Official language', score.spouse.language], ['Canadian experience', score.spouse.canadianWork],
          ]} />}
        </section>
        <section className="crs__result-section">
          <h3>C. Skill transferability <span className="num">{score.transferability.total}</span></h3>
          <p className="crs__hint">Maximum 100 across all combinations</p>
          <Rows rows={[
            ['Education combinations · max 50', score.transferability.educationTotal],
            ['Foreign experience combinations · max 50', score.transferability.foreignTotal],
            ['Trade certificate + language', score.transferability.certificate],
          ]} />
          <details className="crs__details">
            <summary>View combinations before the caps</summary>
            <Rows rows={[
              ['Education + first language', score.transferability.educationLanguage],
              ['Education + Canadian experience', score.transferability.educationWork],
              ['Foreign experience + first language', score.transferability.foreignLanguage],
              ['Foreign + Canadian experience', score.transferability.foreignCanadian],
            ]} />
          </details>
        </section>
        <section className="crs__result-section">
          <h3>D. Additional points <span className="num">{score.additional.total}</span></h3>
          <p className="crs__hint">Maximum 600 combined, including nomination</p>
          <Rows rows={[
            ['Provincial nomination', score.additional.nomination], ['Canadian education', score.additional.canadianEducation],
            ['Sibling in Canada', score.additional.sibling], ['French-language skills', score.additional.french],
          ]} />
        </section>
      </div>}
      <div className="crs__result-footer">
        <p>This is a ranking estimate, not an eligibility decision or an invitation to apply. IRCC’s Express Entry system determines your official score.</p>
        <a href={CRS_RULES.calculator} target="_blank" rel="noreferrer">Check with the official calculator</a>
        <Link to="/updates?type=express_entry">View Express Entry rounds →</Link>
      </div>
    </aside>
  );
}
