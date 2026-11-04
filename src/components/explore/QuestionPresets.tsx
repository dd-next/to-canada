import type { ParamPatch } from '../../lib/state';
import { Icon } from '../ui/Icon';

export interface QuestionPreset {
  id: string;
  /** The question, in plain words. */
  label: string;
  /** URL params the preset sets (null removes a param). */
  params: ParamPatch;
  active: boolean;
}

/** "Start with a question": one click sets several URL params (layer, profession, unit, highlight…). */
export function QuestionPresets({ presets, onApply }: { presets: QuestionPreset[]; onApply: (p: QuestionPreset) => void }) {
  if (presets.length === 0) return null;
  return (
    <div className="questions">
      <ul className="questions__list">
        {presets.map((p) => (
          <li key={p.id}>
            <button type="button" className={['question', p.active && 'is-on'].filter(Boolean).join(' ')} aria-pressed={p.active} onClick={() => onApply(p)}>
              <span className="question__text">{p.label}</span>
              <Icon name="arrowRight" size={14} className="question__arrow" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
