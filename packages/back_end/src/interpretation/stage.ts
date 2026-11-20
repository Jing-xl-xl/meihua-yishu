/** 五幕状态机：阶段定义 + 合法迁移 + 派生 */
export type DialogueStage =
  | 'greet'
  | 'clarify'
  | 'cast'
  | 'interpret'
  | 'verdict'
  | 'close';

export const STAGE_LABEL: Record<DialogueStage, string> = {
  greet: '接问',
  clarify: '澄清',
  cast: '起卦',
  interpret: '解卦',
  verdict: '占断',
  close: '收束',
};

const ALLOWED: Record<DialogueStage, DialogueStage[]> = {
  greet: ['greet', 'clarify', 'cast', 'interpret'],
  clarify: ['clarify', 'cast', 'interpret', 'verdict'],
  cast: ['cast', 'interpret', 'verdict', 'clarify'],
  interpret: ['interpret', 'clarify', 'verdict', 'close'],
  verdict: ['verdict', 'close', 'interpret'],
  close: ['close', 'interpret'],
};

export function canTransition(
  from: string | null | undefined,
  to: DialogueStage,
): boolean {
  if (!from) return true;
  if (!(from in ALLOWED)) return true;
  return ALLOWED[from as DialogueStage].includes(to);
}

export function deriveStage(b: {
  case: { cast?: unknown; verdict?: unknown };
  steps: unknown[];
}): DialogueStage {
  if (b.case.verdict) return 'verdict';
  if (b.steps.length > 0) return 'interpret';
  if (b.case.cast) return 'cast';
  return 'greet';
}
