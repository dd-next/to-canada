import { useState, type ReactNode } from 'react';
import { Button, ButtonLink } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Kicker } from '../components/ui/SectionHeader';
import { LanguageFields } from '../components/crs/LanguageFields';
import { CrsResults } from '../components/crs/CrsResults';
import { assessCrs, CRS_RULES, EDUCATION, emptyCrsAnswers, hasPartner, withSpouse, type CrsAnswers, type MaritalStatus, type WageTier, type WorkYears } from '../model/crs';
import { emptyLanguage, languageOf } from '../model/crs-language';
import { formatDate } from '../lib/format';
import '../styles/crs.css';

const YES_NO = [{ value: true, label: 'Yes' }, { value: false, label: 'No' }];
const MARITAL: { value: MaritalStatus; label: string }[] = [
  { value: 'annulled', label: 'Annulled marriage' }, { value: 'common-law', label: 'Common-law' },
  { value: 'divorced', label: 'Divorced / separated' }, { value: 'separated', label: 'Legally separated' },
  { value: 'married', label: 'Married' }, { value: 'single', label: 'Never married / single' }, { value: 'widowed', label: 'Widowed' },
];
const YEARS: { value: WorkYears; label: string }[] = [
  { value: 0, label: 'None or less than one year' }, { value: 1, label: '1 year' }, { value: 2, label: '2 years' },
  { value: 3, label: '3 years' }, { value: 4, label: '4 years' }, { value: 5, label: '5 years or more' },
];
const TIERS: { value: WageTier; label: string }[] = [
  { value: 'none', label: 'No qualifying high-wage experience' },
  { value: '1.3', label: 'At least 1.3×, but below 1.5× the median wage' },
  { value: '1.5', label: 'At least 1.5×, but below 2× the median wage' },
  { value: '2', label: 'At least 2× the median wage' },
];

function Choice<T extends string | number | boolean>({ id, label, value, onChange, options, hint }: {
  id: string; label: string; value: T | null; onChange: (value: T | null) => void;
  options: readonly { value: T; label: string }[]; hint?: ReactNode;
}) {
  return <Select id={id} label={label} value={value === null ? '' : String(value)} onChange={(v) => onChange(options.find((o) => String(o.value) === v)?.value ?? null)}
    options={[{ value: '', label: 'Select an answer' }, ...options.map((o) => ({ value: String(o.value), label: o.label }))]} hint={hint} />;
}

function Section({ number, id, title, children }: { number: string; id: string; title: string; children: ReactNode }) {
  return <section id={id} className="crs__section" aria-labelledby={`${id}-title`}>
    <div className="crs__section-heading"><span className="label">{number}</span><h2 id={`${id}-title`}>{title}</h2></div>
    <div className="crs__section-body">{children}</div>
  </section>;
}

export default function ExpressEntryPage() {
  const [answers, setAnswers] = useState(emptyCrsAnswers);
  const update = <K extends keyof CrsAnswers>(key: K, value: CrsAnswers[K]) => setAnswers((a) => ({ ...a, [key]: value }));
  const updatePartner = <K extends 'maritalStatus' | 'spouseCanadian' | 'spouseAccompanying'>(key: K, value: CrsAnswers[K]) =>
    setAnswers((a) => ({ ...a, [key]: value, sibling: null }));
  const assessment = assessCrs(answers);
  const firstLanguage = languageOf(answers.firstLanguage.test);
  const accompanied = withSpouse(answers);
  return (
    <div className="page crs">
      <header className="crs__hero">
        <div>
          <Kicker>Express Entry · CRS calculator</Kicker>
          <h1 className="display">Know where<br />you stand.</h1>
          <p className="dek">Estimate your Comprehensive Ranking System score, with every point explained.</p>
        </div>
        <div className="crs__edition">
          <span className="label">Rules in effect</span>
          <strong>{formatDate(CRS_RULES.effective)}</strong>
          <span>Checked against IRCC on {formatDate(CRS_RULES.checked)}</span>
          <a href={CRS_RULES.criteria} target="_blank" rel="noreferrer">Official scoring criteria</a>
        </div>
      </header>

      <div className="crs__intro">
        <p><strong>Updated labour market factor.</strong> Canadian experience and a high-wage job offer are compared; the higher score counts. The overall maximum is now 1,270.</p>
        <p>Your answers stay on this page and are cleared when you leave or reload. No account needed.</p>
      </div>
      <nav className="crs__jump" aria-label="Calculator sections">
        <a href="#crs-profile">01 Profile</a><a href="#crs-education">02 Education</a><a href="#crs-languages">03 Languages</a>
        <a href="#crs-work">04 Work</a><a href="#crs-additional">05 Additional</a>{accompanied && <a href="#crs-partner">06 Partner</a>}
      </nav>

      <div className="crs__layout">
        <form className="crs__form" onSubmit={(e) => e.preventDefault()} aria-label="Express Entry CRS profile">
          <Section number="01" id="crs-profile" title="Your profile">
            <Choice id="maritalStatus" label="Marital status" value={answers.maritalStatus} onChange={(v) => updatePartner('maritalStatus', v)} options={MARITAL} />
            {hasPartner(answers) && <>
              <Choice id="spouseCanadian" label="Is your partner a Canadian citizen or permanent resident?" value={answers.spouseCanadian} onChange={(v) => updatePartner('spouseCanadian', v)} options={YES_NO} />
              {answers.spouseCanadian === false && <Choice id="spouseAccompanying" label="Will your partner come with you to Canada?" value={answers.spouseAccompanying} onChange={(v) => updatePartner('spouseAccompanying', v)} options={YES_NO} />}
              <p className="crs__hint">If your partner is not accompanying you, or is already a Canadian citizen or permanent resident, IRCC uses the points scale for applicants without a spouse.</p>
            </>}
            <Choice id="age" label="How old are you?" value={answers.age} onChange={(v) => update('age', v)}
              options={[{ value: 17, label: '17 or younger' }, ...Array.from({ length: 27 }, (_, i) => ({ value: i + 18, label: String(i + 18) })), { value: 45, label: '45 or older' }]}
              hint="Use your current age, or your age on the date of your invitation to apply if you have already been invited." />
          </Section>

          <Section number="02" id="crs-education" title="Your education">
            <Choice id="education" label="Highest assessed level of education" value={answers.education} onChange={(v) => update('education', v)} options={EDUCATION}
              hint="Use a Canadian credential or its Educational Credential Assessment (ECA) equivalent. An ECA must be from a designated organization and less than five years old." />
            <details className="crs__details"><summary>Multiple credentials and professional degrees</summary><p>For two or more credentials, at least one must be from a program of three years or longer. Foreign credentials need an ECA. Eligible professional degrees are in medicine, veterinary medicine, dentistry, optometry, law, chiropractic medicine or pharmacy.</p></details>
            <Choice id="canadianEducation" label="Eligible Canadian study for additional points" value={answers.canadianEducation} onChange={(v) => update('canadianEducation', v)}
              options={[
                { value: 'none', label: 'No eligible Canadian credential' }, { value: 'secondary', label: 'Secondary school or less · 0 points' },
                { value: 'one-or-two', label: 'One- or two-year post-secondary credential · 15 points' },
                { value: 'three-or-more', label: '3+ years, or eligible master’s / professional / PhD · 30 points' },
              ]}
              hint="Select only study that meets the conditions below. Master’s, professional and doctoral programs must be at least one academic year." />
            <details className="crs__details"><summary>Which Canadian study qualifies?</summary>
              <ul><li>Study at an accredited institution in Canada; foreign campuses do not count.</li><li>English or French language training must not make up more than half of the program.</li><li>No award requiring you to return to your home country to apply your skills after graduation.</li><li>Full-time enrolment and physical presence in Canada for at least eight months. IRCC provides an exception for programs completed in whole or in part between March 2020 and August 2022.</li><li>Distance learning can count for core education points, but generally not for Canadian-study bonus points. Check IRCC’s rules for your study period.</li></ul>
              <a href={CRS_RULES.calculator} target="_blank" rel="noreferrer">Read IRCC’s study conditions</a>
            </details>
          </Section>

          <Section number="03" id="crs-languages" title="Official languages">
            <Choice id="testsRecent" label="Are your language test results less than two years old?" value={answers.testsRecent} onChange={(v) => update('testsRecent', v)} options={YES_NO} />
            {answers.testsRecent === false && <p className="crs__note">An approved, valid language test is required even if English or French is your first language. <a href={CRS_RULES.language} target="_blank" rel="noreferrer">Check the requirements</a>.</p>}
            {answers.testsRecent === true && <>
              <LanguageFields id="firstLanguage" title="First official language" value={answers.firstLanguage}
                onChange={(v) => setAnswers((a) => ({ ...a, firstLanguage: v, secondLanguage: a.firstLanguage.test === v.test ? a.secondLanguage : emptyLanguage() }))} />
              {firstLanguage && <LanguageFields id="secondLanguage" title="Second official language" value={answers.secondLanguage} onChange={(v) => update('secondLanguage', v)} language={firstLanguage === 'en' ? 'fr' : 'en'} optional />}
              <p className="crs__hint">Skill-transferability points use your first official language. French bonus points can apply whether French is your first or second language.</p>
            </>}
          </Section>

          <Section number="04" id="crs-work" title="Work & labour market integration">
            <Choice id="canadianYears" label="Years of skilled work in Canada in the last 10 years" value={answers.canadianYears} onChange={(v) => setAnswers((a) => ({ ...a, canadianYears: v, highWageExperience: v === 0 ? null : a.highWageExperience }))} options={YEARS} />
            <p className="crs__hint">Paid work in NOC TEER 0, 1, 2 or 3, full-time or an equivalent amount of part-time work. You must have been physically in Canada, working for a Canadian employer. Do not count unauthorized work, work while a full-time student, or self-employment unless an IRCC physician exception applies.</p>
            {answers.canadianYears !== null && answers.canadianYears > 0 && <Choice id="highWageExperience" label="Qualifying high-wage Canadian experience" value={answers.highWageExperience} onChange={(v) => update('highWageExperience', v)} options={TIERS}
              hint="Choose the highest category in which you have at least 12 months (1,560 hours) combined across qualifying jobs in the last 10 years. Count at most 30 hours per week across all jobs. The 1.5× threshold can combine occupations at 1.5× and 2×; the 1.3× threshold can combine all three levels." />}
            <div className="crs__note">
              <strong>Check the occupation, not your salary.</strong>
              <p>High-wage categories come from IRCC’s NOC list, based on the occupation’s median wage across Canada. Your own salary does not determine the category.</p>
              <a href={CRS_RULES.highWage + '#list'} target="_blank" rel="noreferrer">Find your NOC in the official high-wage list</a>
            </div>
            <Choice id="foreignYears" label="Years of skilled work outside Canada in the last 10 years" value={answers.foreignYears} onChange={(v) => update('foreignYears', v)}
              options={[...YEARS.slice(0, 3) as { value: 0 | 1 | 2 | 3; label: string }[], { value: 3, label: '3 years or more' }]}
              hint="Paid work in TEER 0, 1, 2 or 3, full-time or the part-time equivalent." />
            <Choice id="tradeCertificate" label="Do you have a Canadian certificate of qualification in a skilled trade?" value={answers.tradeCertificate} onChange={(v) => update('tradeCertificate', v)} options={YES_NO}
              hint="Issued by a Canadian province, territory or federal body after assessment and a certification exam. This is not a provincial nomination, job offer or ordinary diploma." />
            <Choice id="jobOffer" label="Valid job offer in a high-wage occupation" value={answers.jobOffer} onChange={(v) => update('jobOffer', v)}
              options={[{ value: 'none', label: 'No valid offer in a listed high-wage occupation' }, ...TIERS.slice(1)]}
              hint="Choose the occupation’s category only if the offer meets IRCC’s validity requirements. An offer outside the high-wage list gives no CRS points." />
            <details className="crs__details"><summary>What makes a job offer valid?</summary>
              <p>A full-time, paid, continuous, non-seasonal offer in an eligible skilled occupation, for at least one year after you become a permanent resident. The employer cannot be an embassy, high commission, consulate or an ineligible employer.</p>
              <p>LMIA and LMIA-exemption requirements were removed on November 3, 2026. Other validity and program conditions still apply, including specific exceptions for eligible physicians. Job offers can affect program eligibility even when they earn no CRS points.</p>
              <a href={CRS_RULES.jobOffer} target="_blank" rel="noreferrer">Check the full job-offer criteria</a>
            </details>
          </Section>

          <Section number="05" id="crs-additional" title="Additional points">
            <Choice id="nomination" label="Do you have a provincial or territorial nomination?" value={answers.nomination} onChange={(v) => update('nomination', v)} options={YES_NO}
              hint="An Express Entry nomination certificate, not an application, expression of interest or invitation to seek a nomination." />
            <Choice id="sibling" label="Do you or your accompanying partner have a qualifying sibling in Canada?" value={answers.sibling} onChange={(v) => update('sibling', v)} options={YES_NO}
              hint="A brother or sister aged 18 or older, living in Canada as a citizen or permanent resident. You must share a parent by blood, adoption, marriage or common-law partnership. Multiple siblings still give 15 points in total." />
            <p className="crs__hint">Canadian study and French-language bonuses are calculated from your earlier answers. All additional points together are capped at 600.</p>
          </Section>

          {accompanied && <Section number="06" id="crs-partner" title="Your accompanying partner">
            <Choice id="spouseEducation" label="Partner’s highest assessed education" value={answers.spouseEducation} onChange={(v) => update('spouseEducation', v)} options={EDUCATION}
              hint="A Canadian credential, or a foreign credential with an ECA from a designated organization issued within the last five years." />
            <Choice id="spouseCanadianYears" label="Partner’s years of skilled Canadian work in the last 10 years" value={answers.spouseCanadianYears} onChange={(v) => update('spouseCanadianYears', v)} options={YEARS}
              hint="Paid work in TEER 0, 1, 2 or 3, full-time or the part-time equivalent, while physically in Canada." />
            <LanguageFields id="spouseLanguage" title="Partner’s official language" value={answers.spouseLanguage} onChange={(v) => update('spouseLanguage', v)} optional />
          </Section>}
          <div className="crs__actions"><a className="btn btn--primary btn--md" href="#crs-result-title">View your score ↑</a><Button onClick={() => setAnswers(emptyCrsAnswers())}>Reset all answers</Button><ButtonLink to="/immigration" variant="ghost">Explore immigration programs →</ButtonLink></div>
        </form>
        <CrsResults assessment={assessment} />
      </div>
      <section className="crs__sources" aria-labelledby="crs-sources-title">
        <h2 id="crs-sources-title" className="h3">Sources & scope</h2>
        <p>This independent calculator uses IRCC’s CRS criteria effective November 3, 2026. It estimates ranking points for Express Entry; it does not assess Federal Skilled Worker eligibility, the separate 67-point selection grid, or eligibility for category-based invitations.</p>
        <p>The rules and test-score bands were checked on {formatDate(CRS_RULES.checked)}. They are a versioned reference, not a live connection to IRCC. If you already have an invitation, check the rules and high-wage list that applied on your invitation date.</p>
        <div className="crs__source-links"><a href={CRS_RULES.calculator} target="_blank" rel="noreferrer">IRCC calculator</a><a href={CRS_RULES.criteria} target="_blank" rel="noreferrer">CRS point tables</a><a href={CRS_RULES.highWage} target="_blank" rel="noreferrer">High-wage occupations</a><a href={CRS_RULES.language} target="_blank" rel="noreferrer">Language tests</a></div>
      </section>
    </div>
  );
}
