import { errorText } from '../shared/faults.ts';
import type { Browser } from '../browser/browser.ts';
import type { ProcedureLibrary } from './library.ts';
import { cut, noteRun, REPAIR_NOW, runVersions, summaryLine } from './run.ts';

/**
 * The routine: every procedure marked `onAlarm` runs once in a tab of its own, and each leaves one line. A host runs it
 * on its own schedule (before an alarm, from cron, or when the agent calls `procedure_routines`). Nothing read here is
 * filed as messages: nobody chose to read it.
 */
export function createRoutines(deps: { library: ProcedureLibrary; browser: Pick<Browser, 'scratch'>; perToolMs?: number; totalMs?: number }) {
  const perToolMs = deps.perToolMs ?? 20_000, totalMs = deps.totalMs ?? 60_000;
  return async function routines(): Promise<string | undefined> {
    const due = deps.library.list().filter(({ procedure }) => procedure.onAlarm);
    if (!due.length) return undefined;
    const deadline = Date.now() + totalMs, lines: string[] = [];
    let broken = false;
    for (const { procedure, path } of due) {
      const left = Math.min(perToolMs, deadline - Date.now());
      if (left <= 0) { lines.push(`${path} 没来得及跑（例行的时间用完了）`); continue; }
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error(`超过 ${Math.max(1, Math.ceil(left / 1000))} 秒`)); }, left); });
      try {
        const kept = deps.library.kept(path);
        const outcome = await Promise.race([deps.browser.scratch((page, signal) => runVersions(procedure, kept, {}, page, AbortSignal.any([signal, controller.signal])), controller.signal), late]);
        noteRun(deps.library, path, outcome);
        if (!outcome.result.ok) broken = true;
        lines.push(summaryLine(outcome.ran, outcome.result) + (outcome.fallback ? `（最新版没跑通，用的第 ${outcome.fallback.version} 版）` : ''));
      } catch (error) {
        noteRun(deps.library, path, { thrown: error });
        broken = true;
        lines.push(`${path} 没跑通（${cut(errorText(error), 80)}）`);
      } finally { clearTimeout(timer); }
    }
    // Nobody watched these runs, so this is the first the agent hears of a break, and the time to mend it.
    return [...lines, ...(broken ? [`上面没跑通的，${REPAIR_NOW}`] : [])].join('\n');
  };
}
