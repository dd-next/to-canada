import { useCallback, useMemo, type ReactNode } from 'react';
import type { Occupation } from '../../types/contract';
import { normalize } from '../../lib/places';
import { Combobox, type ComboOption } from '../ui/Combobox';

export interface ProfessionPickerProps {
  occupations: Occupation[] | undefined;
  loading?: boolean;
  error?: Error;
  noc: string | null;
  onChange: (noc: string | null) => void;
  /** Coverage / qualifier line under the picker. */
  summary?: ReactNode;
}

interface Indexed {
  o: Occupation;
  title: string;
  words: string[];
  examples: string[];
}

/** Rank occupations for a query: NOC code, title prefix, word prefix, substring, example titles. */
export function useOccupationSearch(occupations: Occupation[] | undefined) {
  const index = useMemo<Indexed[]>(
    () =>
      (occupations ?? [])
        .map((o) => ({ o, title: normalize(o.title), words: normalize(o.title).split(' '), examples: (o.examples ?? []).map(normalize) }))
        .sort((a, b) => a.o.title.localeCompare(b.o.title)),
    [occupations],
  );
  return useCallback(
    (query: string): ComboOption<Occupation>[] => {
      const q = normalize(query);
      const toOption = (x: Indexed, via?: string): ComboOption<Occupation> => ({
        key: x.o.noc,
        label: x.o.title,
        item: x.o,
        meta: `NOC ${x.o.noc}`,
        description: via ? `Includes “${via}”` : `TEER ${x.o.teer} · ${x.o.broadTitle}`,
      });
      if (!q) return index.map((x) => toOption(x));
      const scored: { x: Indexed; s: number; via?: string }[] = [];
      const qWords = q.split(' ');
      for (const x of index) {
        let s = 0;
        let via: string | undefined;
        if (/^\d+$/.test(q)) {
          if (x.o.noc === q) s = 100;
          else if (x.o.noc.startsWith(q)) s = 80;
        } else {
          if (x.title === q) s = 100;
          else if (x.title.startsWith(q)) s = 85;
          else if (qWords.every((w) => x.words.some((tw) => tw.startsWith(w)))) s = 70;
          else if (x.title.includes(q)) s = 55;
          else {
            const i = x.examples.findIndex((e) => e.includes(q) || qWords.every((w) => e.split(' ').some((ew) => ew.startsWith(w))));
            if (i >= 0) {
              s = 40;
              via = x.o.examples?.[i];
            }
          }
        }
        if (s) scored.push({ x, s, via });
      }
      scored.sort((a, b) => b.s - a.s || a.x.o.title.length - b.x.o.title.length);
      return scored.map(({ x, via }) => toOption(x, via));
    },
    [index],
  );
}

/** Profession lens: type-ahead over ~500 NOC occupations. */
export function ProfessionPicker({ occupations, loading, error, noc, onChange, summary }: ProfessionPickerProps) {
  const search = useOccupationSearch(occupations);
  const current = noc ? occupations?.find((o) => o.noc === noc) : undefined;
  const selected: ComboOption<Occupation> | null = current ? { key: current.noc, label: current.title, item: current, meta: `NOC ${current.noc}` } : null;
  const count = occupations?.length;
  return (
    <div className="profession">
      <Combobox
        label="Your profession"
        placeholder={error ? 'Occupation list unavailable' : count ? `Search ${count} occupations or a NOC code` : 'Loading occupations…'}
        search={search}
        selected={selected}
        onSelect={(o) => onChange(o ? o.key : null)}
        disabled={!!error || !occupations}
        loading={loading}
        icon="briefcase"
        maxResults={40}
        emptyMessage={(q) => (
          <>
            No occupation matches “{q}”. Try a broader word (e.g. “engineer”) or a five-digit NOC code.
          </>
        )}
        hint={
          error
            ? `Could not load occupations (${error.message}).`
            : noc && !current && occupations
              ? `No occupation with NOC code ${noc} in this snapshot.`
              : summary
        }
      />
    </div>
  );
}
