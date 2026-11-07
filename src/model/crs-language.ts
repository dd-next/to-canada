/** IRCC calculator score bands, checked 2026-11-07. TEF uses previous-score equivalency. */
export const ABILITIES = ['speaking', 'listening', 'reading', 'writing'] as const;
export type Ability = typeof ABILITIES[number];
export const BENCHMARKS = [0, 4, 5, 6, 7, 8, 9, 10] as const;
export type Benchmark = typeof BENCHMARKS[number];
export type LanguageTest = 'celpip' | 'ielts' | 'pte' | 'tef' | 'tcf';
export type LanguageScores = Record<Ability, Benchmark | null>;
export interface LanguageAnswer {
  test: LanguageTest | 'none' | '';
  scores: LanguageScores;
}
export const LANGUAGE_TESTS: Record<LanguageTest, { label: string; language: 'en' | 'fr'; bands: readonly (readonly string[])[] }> = {
  celpip: {
    label: 'CELPIP-General', language: 'en',
    bands: [
      ['M, 0–3', 'M, 0–3', 'M, 0–3', 'M, 0–3'],
      ['4', '4', '4', '4'], ['5', '5', '5', '5'], ['6', '6', '6', '6'],
      ['7', '7', '7', '7'], ['8', '8', '8', '8'], ['9', '9', '9', '9'], ['10–12', '10–12', '10–12', '10–12'],
    ],
  },
  ielts: {
    label: 'IELTS General Training', language: 'en',
    bands: [
      ['0–3.5', '0–4.0', '0–3.0', '0–3.5'], ['4.0–4.5', '4.5', '3.5', '4.0–4.5'],
      ['5.0', '5.0', '4.0–4.5', '5.0'], ['5.5', '5.5', '5.0–5.5', '5.5'],
      ['6.0', '6.0–7.0', '6.0', '6.0'], ['6.5', '7.5', '6.5', '6.5'],
      ['7.0', '8.0', '7.0–7.5', '7.0'], ['7.5–9.0', '8.5–9.0', '8.0–9.0', '7.5–9.0'],
    ],
  },
  pte: {
    label: 'PTE Core', language: 'en',
    bands: [
      ['0–41', '0–27', '0–32', '0–40'], ['42–50', '28–38', '33–41', '41–50'],
      ['51–58', '39–49', '42–50', '51–59'], ['59–67', '50–59', '51–59', '60–68'],
      ['68–75', '60–70', '60–68', '69–78'], ['76–83', '71–81', '69–77', '79–87'],
      ['84–88', '82–88', '78–87', '88–89'], ['89–90', '89–90', '88–90', '90'],
    ],
  },
  tef: {
    label: 'TEF Canada', language: 'fr',
    bands: [
      ['0–180', '0–144', '0–120', '0–180'], ['181–225', '145–180', '121–150', '181–225'],
      ['226–270', '181–216', '151–180', '226–270'], ['271–309', '217–248', '181–206', '271–309'],
      ['310–348', '249–279', '207–232', '310–348'], ['349–370', '280–297', '233–247', '349–370'],
      ['371–392', '298–315', '248–262', '371–392'], ['393–450', '316–360', '263–300', '393–450'],
    ],
  },
  tcf: {
    label: 'TCF Canada', language: 'fr',
    bands: [
      ['0–3', '0–330', '0–341', '0–3'], ['4–5', '331–368', '342–374', '4–5'],
      ['6', '369–397', '375–405', '6'], ['7–9', '398–457', '406–452', '7–9'],
      ['10–11', '458–502', '453–498', '10–11'], ['12–13', '503–522', '499–523', '12–13'],
      ['14–15', '523–548', '524–548', '14–15'], ['16–20', '549–699', '549–699', '16–20'],
    ],
  },
};

export function emptyLanguage(test: LanguageAnswer['test'] = ''): LanguageAnswer {
  return { test, scores: { speaking: null, listening: null, reading: null, writing: null } };
}

export function languageOf(test: LanguageAnswer['test']) {
  return test && test !== 'none' ? LANGUAGE_TESTS[test]?.language : undefined;
}

export function scoreOptions(test: LanguageTest, ability: Ability) {
  const i = ABILITIES.indexOf(ability);
  const benchmarkName = languageOf(test) === 'fr' ? 'NCLC' : 'CLB';
  return BENCHMARKS.map((clb, b) => ({
    value: String(clb),
    label: `${LANGUAGE_TESTS[test].bands[b][i]} · ${benchmarkName} ${clb === 0 ? 'below 4' : clb === 10 ? '10+' : clb}`,
  })).reverse();
}
