import { useEffect, useState } from 'react';
import { loadJSON } from '../../data/api';
import type { LmiaPartition, LmiaPeriod } from '../../types/lmia';
import { decodeLmiaPartition, prepareLmiaRows, type SearchableLmiaRow } from './model';

interface LmiaRowsState { key: string; rows?: SearchableLmiaRow[]; loading: boolean; loaded: number; total: number; error?: Error }

/** Load the whole selected period set; never report partial downloads as complete results. */
export function useLmiaRows(periods: LmiaPeriod[], generation: string): LmiaRowsState {
  const key = JSON.stringify([generation, periods.map((period) => [period.id, period.indexPath, period.resourceId, period.rowCount])]);
  const [state, setState] = useState<LmiaRowsState>({ key: '', loading: false, loaded: 0, total: 0 });
  useEffect(() => {
    let alive = true;
    setState({ key, loading: periods.length > 0, loaded: 0, total: periods.length, ...(periods.length ? {} : { rows: [] }) });
    if (!periods.length) return;
    async function load() {
      const results: SearchableLmiaRow[][] = new Array(periods.length);
      let cursor = 0, complete = 0, failed = false;
      const worker = async () => {
        while (alive && !failed && cursor < periods.length) {
          const index = cursor++;
          const period = periods[index];
          if (!/^lmia\/periods\/[A-Za-z0-9._-]+\.json$/.test(period.indexPath)) throw new Error('The reporting-period file path is invalid.');
          const partition = await loadJSON<LmiaPartition>(period.indexPath);
          results[index] = prepareLmiaRows(decodeLmiaPartition(partition, period));
          complete++;
          if (alive && !failed) setState({ key, loading: true, loaded: complete, total: periods.length });
        }
      };
      try {
        await Promise.all(Array.from({ length: Math.min(2, periods.length) }, worker));
        if (alive) setState({ key, rows: results.flat(), loading: false, loaded: complete, total: periods.length });
      } catch (error) {
        failed = true;
        if (alive) setState({ key, loading: false, loaded: complete, total: periods.length, error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
    void load();
    return () => { alive = false; };
    // The serialized key contains all partition inputs. It avoids restarting on ordinary filter renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state : { key, loading: periods.length > 0, loaded: 0, total: periods.length };
}
