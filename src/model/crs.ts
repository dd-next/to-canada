import { ABILITIES, BENCHMARKS, emptyLanguage, languageOf, type LanguageAnswer } from './crs-language';

const EE = 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry';
export const CRS_RULES = {
  effective: '2026-11-03', checked: '2026-11-08', maximum: 1270,
  calculator: `${EE}/check-score.html`, criteria: `${EE}/check-score/crs-criteria.html`,
  highWage: `${EE}/check-score/high-wage.html`, language: `${EE}/documents/language-test.html`,
  jobOffer: `${EE}/documents/job-offer.html`,
} as const;

export const EDUCATION = [
  { value: 'none', label: 'Less than secondary school' },
  { value: 'secondary', label: 'Secondary diploma (high school)' },
  { value: 'one-year', label: 'One-year post-secondary credential' },
  { value: 'two-year', label: 'Two-year post-secondary credential' },
  { value: 'bachelors', label: 'Bachelor’s degree or a program of 3+ years' },
  { value: 'two-or-more', label: 'Two or more credentials, including one of 3+ years' },
  { value: 'masters', label: 'Master’s or eligible professional degree' },
  { value: 'doctorate', label: 'Doctoral degree (PhD)' },
] as const;
export type Education = typeof EDUCATION[number]['value'];
export type MaritalStatus = 'annulled' | 'common-law' | 'divorced' | 'separated' | 'married' | 'single' | 'widowed';
export type WageTier = 'none' | '1.3' | '1.5' | '2';
export type WorkYears = 0 | 1 | 2 | 3 | 4 | 5;
export interface CrsAnswers {
  maritalStatus: MaritalStatus | null;
  spouseCanadian: boolean | null;
  spouseAccompanying: boolean | null;
  age: number | null;
  education: Education | null;
  canadianEducation: 'none' | 'secondary' | 'one-or-two' | 'three-or-more' | null;
  testsRecent: boolean | null;
  firstLanguage: LanguageAnswer;
  secondLanguage: LanguageAnswer;
  canadianYears: WorkYears | null;
  highWageExperience: WageTier | null;
  foreignYears: 0 | 1 | 2 | 3 | null;
  tradeCertificate: boolean | null;
  jobOffer: WageTier | null;
  nomination: boolean | null;
  sibling: boolean | null;
  spouseEducation: Education | null;
  spouseCanadianYears: WorkYears | null;
  spouseLanguage: LanguageAnswer;
}

export function emptyCrsAnswers(): CrsAnswers {
  return {
    maritalStatus: null, spouseCanadian: null, spouseAccompanying: null, age: null, education: null,
    canadianEducation: null, testsRecent: null, firstLanguage: emptyLanguage(), secondLanguage: emptyLanguage(),
    canadianYears: null, highWageExperience: null, foreignYears: null, tradeCertificate: null,
    jobOffer: null, nomination: null, sibling: null, spouseEducation: null, spouseCanadianYears: null,
    spouseLanguage: emptyLanguage(),
  };
}

export function hasPartner(a: CrsAnswers) {
  return a.maritalStatus === 'married' || a.maritalStatus === 'common-law';
}
export function withSpouse(a: CrsAnswers) {
  return hasPartner(a) && a.spouseCanadian === false && a.spouseAccompanying === true;
}

export interface MissingAnswer { id: string; label: string }
export function missingCrsAnswers(a: CrsAnswers): MissingAnswer[] {
  const missing: MissingAnswer[] = [];
  const need = (id: keyof CrsAnswers, label: string) => {
    if (a[id] === null) missing.push({ id, label });
  };
  const language = (id: 'firstLanguage' | 'secondLanguage' | 'spouseLanguage', label: string) => {
    if (!a[id].test) missing.push({ id: `${id}-test`, label: `${label} test` });
    else if (a[id].test !== 'none') ABILITIES.forEach((ability) => {
      if (a[id].scores[ability] === null) missing.push({ id: `${id}-${ability}`, label: `${label}: ${ability}` });
    });
  };
  need('maritalStatus', 'Marital status');
  if (hasPartner(a)) {
    need('spouseCanadian', 'Partner’s Canadian citizenship or permanent residence');
    if (a.spouseCanadian === false) need('spouseAccompanying', 'Accompanying partner');
  }
  need('age', 'Age'); need('education', 'Education'); need('canadianEducation', 'Eligible Canadian education');
  need('testsRecent', 'Language test validity');
  if (a.testsRecent === true) {
    language('firstLanguage', 'First language');
    if (languageOf(a.firstLanguage.test)) language('secondLanguage', 'Second language');
  }
  need('canadianYears', 'Canadian work experience');
  if (a.canadianYears !== null && a.canadianYears > 0) need('highWageExperience', 'High-wage Canadian experience');
  need('foreignYears', 'Foreign work experience'); need('tradeCertificate', 'Trade certificate');
  need('jobOffer', 'Valid high-wage job offer'); need('nomination', 'Provincial nomination'); need('sibling', 'Sibling in Canada');
  if (withSpouse(a)) {
    need('spouseEducation', 'Partner’s education'); need('spouseCanadianYears', 'Partner’s Canadian work experience');
    language('spouseLanguage', 'Partner’s language');
  }
  return missing;
}

// Published CRS criteria, in EDUCATION order. A partner who is not accompanying,
// or is a Canadian citizen/PR, never changes the principal applicant's scale.
const EDUCATION_POINTS = { single: [0, 30, 90, 98, 120, 128, 135, 150], spouse: [0, 28, 84, 91, 112, 119, 126, 140] };
const AGE_POINTS = {
  single: [99, 105, ...Array<number>(10).fill(110), 105, 99, 94, 88, 83, 77, 72, 66, 61, 55, 50, 39, 28, 17, 6],
  spouse: [90, 95, ...Array<number>(10).fill(100), 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 35, 25, 15, 5],
};
const WORK_POINTS = { single: [0, 40, 53, 64, 72, 80], spouse: [0, 35, 46, 56, 63, 70] };
const FIRST_LANGUAGE_POINTS = { single: [0, 6, 6, 9, 17, 23, 31, 34], spouse: [0, 6, 6, 8, 16, 22, 29, 32] };
const SECOND_LANGUAGE_POINTS = [0, 0, 1, 1, 3, 3, 6, 6];
const SPOUSE_LANGUAGE_POINTS = [0, 0, 1, 1, 3, 3, 5, 5];
const EXPERIENCE_BONUS: Record<WageTier, number> = { none: 0, '1.3': 20, '1.5': 40, '2': 70 };
const OFFER_POINTS: Record<WageTier, number> = { none: 0, '1.3': 50, '1.5': 70, '2': 100 };
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const educationIndex = (value: Education | null) => EDUCATION.findIndex((e) => e.value === value);
const scores = (answer: LanguageAnswer) => ABILITIES.map((ability) => answer.scores[ability] ?? 0);
const languagePoints = (answer: LanguageAnswer, table: number[]) => answer.test === 'none' ? 0 : sum(scores(answer).map((v) => table[BENCHMARKS.indexOf(v)]));

export interface CrsScore {
  total: number;
  officialCalculatorTotal: number;
  withSpouse: boolean;
  core: { age: number; education: number; firstLanguage: number; secondLanguage: number; labourMarket: number; total: number };
  labourMarket: { workLength: number; highWageExperience: number; experienceTotal: number; jobOffer: number };
  spouse: { education: number; language: number; canadianWork: number; total: number };
  transferability: {
    educationLanguage: number; educationWork: number; educationTotal: number;
    foreignLanguage: number; foreignCanadian: number; foreignTotal: number; certificate: number; total: number;
  };
  additional: { nomination: number; canadianEducation: number; sibling: number; french: number; total: number };
  calculatorDifferences: string[];
}
export type CrsAssessment =
  | { status: 'incomplete'; missing: MissingAnswer[] }
  | { status: 'invalid'; messages: string[] }
  | { status: 'complete'; score: CrsScore };

/** No partial total: unanswered fields are never silently interpreted as “no”. */
export function assessCrs(a: CrsAnswers): CrsAssessment {
  if (a.testsRecent === false) return { status: 'invalid', messages: ['You need an approved language test taken less than two years ago to create an Express Entry profile.'] };
  const missing = missingCrsAnswers(a);
  if (missing.length) return { status: 'incomplete', missing };
  const errors: string[] = [];
  if (!Number.isInteger(a.age) || a.age! < 0 || a.age! > 120) errors.push('Choose a valid age.');
  if (educationIndex(a.education) < 0) errors.push('Choose a valid education level.');
  if (!languageOf(a.firstLanguage.test)) errors.push('Choose an approved first language test.');
  if (languageOf(a.firstLanguage.test) === languageOf(a.secondLanguage.test)) errors.push('The second language must be different from the first.');
  const activeLanguages = [a.firstLanguage, a.secondLanguage, ...(withSpouse(a) ? [a.spouseLanguage] : [])];
  for (const language of activeLanguages) {
    if (language.test === 'none') continue;
    if (!languageOf(language.test) || ABILITIES.some((ability) => !BENCHMARKS.includes(language.scores[ability]!))) errors.push('Complete all four scores for an approved language test.');
  }
  if (![0, 1, 2, 3, 4, 5].includes(a.canadianYears!) || ![0, 1, 2, 3].includes(a.foreignYears!)) errors.push('Choose a valid work-experience duration.');
  if (!(a.jobOffer! in OFFER_POINTS) || (a.canadianYears! > 0 && !(a.highWageExperience! in EXPERIENCE_BONUS))) errors.push('Choose an official high-wage category.');
  if (withSpouse(a) && (educationIndex(a.spouseEducation) < 0 || ![0, 1, 2, 3, 4, 5].includes(a.spouseCanadianYears!))) errors.push('Complete your partner’s education and work experience.');
  if (errors.length) return { status: 'invalid', messages: errors };

  const partner = withSpouse(a);
  const scale = partner ? 'spouse' : 'single';
  const edu = educationIndex(a.education);
  const years = a.canadianYears!;
  const minimumLanguage = Math.min(...scores(a.firstLanguage));
  const workLength = WORK_POINTS[scale][years];
  const highWageExperience = years > 0 ? EXPERIENCE_BONUS[a.highWageExperience!] : 0;
  const experienceTotal = workLength + highWageExperience;
  const jobOffer = OFFER_POINTS[a.jobOffer!];
  const core = {
    age: a.age! < 18 || a.age! >= 45 ? 0 : AGE_POINTS[scale][a.age! - 18],
    education: EDUCATION_POINTS[scale][edu],
    firstLanguage: languagePoints(a.firstLanguage, FIRST_LANGUAGE_POINTS[scale]),
    secondLanguage: Math.min(partner ? 22 : 24, languagePoints(a.secondLanguage, SECOND_LANGUAGE_POINTS)),
    labourMarket: Math.max(experienceTotal, jobOffer), total: 0,
  };
  core.total = core.age + core.education + core.firstLanguage + core.secondLanguage + core.labourMarket;
  const spouse = {
    education: partner ? [0, 2, 6, 7, 8, 9, 10, 10][educationIndex(a.spouseEducation)] : 0,
    language: partner ? languagePoints(a.spouseLanguage, SPOUSE_LANGUAGE_POINTS) : 0,
    canadianWork: partner ? [0, 5, 7, 8, 9, 10][a.spouseCanadianYears!] : 0, total: 0,
  };
  spouse.total = spouse.education + spouse.language + spouse.canadianWork;

  // Each pair has a 50-point cap; all transferability factors together cap at 100.
  const pair = (group: number, strong: boolean) => group === 0 ? 0 : group === 1 ? (strong ? 25 : 13) : (strong ? 50 : 25);
  const educationGroup = edu < 2 ? 0 : edu < 5 ? 1 : 2;
  const foreignGroup = a.foreignYears === 0 ? 0 : a.foreignYears! < 3 ? 1 : 2;
  const educationLanguage = minimumLanguage >= 7 ? pair(educationGroup, minimumLanguage >= 9) : 0;
  const educationWork = years > 0 ? pair(educationGroup, years >= 2) : 0;
  const foreignLanguage = minimumLanguage >= 7 ? pair(foreignGroup, minimumLanguage >= 9) : 0;
  const foreignCanadian = years > 0 ? pair(foreignGroup, years >= 2) : 0;
  const certificate = a.tradeCertificate && minimumLanguage >= 5 ? (minimumLanguage >= 7 ? 50 : 25) : 0;
  const educationTotal = Math.min(50, educationLanguage + educationWork);
  const foreignTotal = Math.min(50, foreignLanguage + foreignCanadian);
  const transferability = { educationLanguage, educationWork, educationTotal, foreignLanguage, foreignCanadian, foreignTotal, certificate, total: Math.min(100, educationTotal + foreignTotal + certificate) };

  const french = [a.firstLanguage, a.secondLanguage].find((l) => languageOf(l.test) === 'fr');
  const english = [a.firstLanguage, a.secondLanguage].find((l) => languageOf(l.test) === 'en');
  const frenchBonus = french && Math.min(...scores(french)) >= 7 ? (english && Math.min(...scores(english)) >= 5 ? 50 : 25) : 0;
  const additional = {
    nomination: a.nomination ? 600 : 0,
    canadianEducation: a.canadianEducation === 'one-or-two' ? 15 : a.canadianEducation === 'three-or-more' ? 30 : 0,
    sibling: a.sibling ? 15 : 0, french: frenchBonus, total: 0,
  };
  additional.total = Math.min(600, additional.nomination + additional.canadianEducation + additional.sibling + additional.french);

  // The public calculator has two reproducible discrepancies with its own CRS
  // criteria (snapshot 2026-11-07). Follow published criteria and disclose these
  // only for affected profiles; see docs/CRS_CALCULATOR.md and reference fixtures.
  const calculatorDifferences: string[] = [];
  const tcfDifference = a.firstLanguage.test === 'tcf' ? scores(a.firstLanguage).filter((level) => level === 4).length * 6 : 0;
  const pteDifference = languageOf(a.firstLanguage.test) === 'fr' && a.secondLanguage.test === 'pte' && frenchBonus === 50;
  if (tcfDifference) calculatorDifferences.push('IRCC’s public calculator currently gives 0 points for a first-language TCF ability at NCLC 4. Its published CRS table awards 6; this estimate uses the published table.');
  if (pteDifference) calculatorDifferences.push('IRCC’s public calculator currently shows a 25-point French bonus with PTE Core as the second language. Its published criteria award 50 when all French skills are NCLC 7+ and all English skills are CLB 5+; this estimate uses those criteria.');
  const officialAdditional = Math.min(600, additional.nomination + additional.canadianEducation + additional.sibling + additional.french - (pteDifference ? 25 : 0));
  const total = core.total + spouse.total + transferability.total + additional.total;
  return { status: 'complete', score: {
    total, officialCalculatorTotal: total - tcfDifference - (additional.total - officialAdditional), withSpouse: partner, core,
    labourMarket: { workLength, highWageExperience, experienceTotal, jobOffer }, spouse, transferability, additional, calculatorDifferences,
  } };
}
