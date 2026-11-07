import { Select } from '../ui/Select';
import { ABILITIES, emptyLanguage, LANGUAGE_TESTS, languageOf, scoreOptions, type Benchmark, type LanguageAnswer, type LanguageTest } from '../../model/crs-language';
import { CRS_RULES } from '../../model/crs';

export function LanguageFields({ id, title, value, onChange, language, optional = false }: {
  id: string; title: string; value: LanguageAnswer; onChange: (answer: LanguageAnswer) => void;
  language?: 'en' | 'fr'; optional?: boolean;
}) {
  const selected = value.test && value.test !== 'none' ? value.test : null;
  return (
    <fieldset className="crs__language">
      <legend>{title}</legend>
      <Select id={`${id}-test`} label={`${title} test`} value={value.test} onChange={(test) => onChange(emptyLanguage(test as LanguageAnswer['test']))}
        options={[
          { value: '', label: 'Select a test' },
          ...(optional ? [{ value: 'none', label: 'No valid test / not applicable' }] : []),
          ...Object.entries(LANGUAGE_TESTS).filter(([, t]) => !language || t.language === language).map(([key, t]) => ({ value: key, label: t.label })),
        ]}
        hint={optional ? 'Only include results taken less than two years ago.' : 'General Training / Core versions only. Academic tests are not accepted.'}
      />
      {selected === 'tef' && <p className="crs__note">Use the <strong>“Équivalence ancien score”</strong> column on your TEF result, not “Score / 699”. <a href={CRS_RULES.language} target="_blank" rel="noreferrer">IRCC’s TEF instructions</a>.</p>}
      {selected && <div className="crs__fields crs__scores">
        {ABILITIES.map((ability) => <Select key={ability} id={`${id}-${ability}`}
          label={ability[0].toUpperCase() + ability.slice(1)}
          value={value.scores[ability] === null ? '' : String(value.scores[ability])}
          onChange={(v) => onChange({ ...value, scores: { ...value.scores, [ability]: v === '' ? null : Number(v) as Benchmark } })}
          options={[{ value: '', label: 'Select your score' }, ...scoreOptions(selected as LanguageTest, ability)]}
        />)}
      </div>}
      {selected && <p className="crs__hint">{languageOf(selected) === 'fr' ? 'NCLC' : 'CLB'} is the Canadian benchmark for each language skill. Choose each score separately.</p>}
    </fieldset>
  );
}
