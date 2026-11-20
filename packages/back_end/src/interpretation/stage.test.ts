import { describe, expect, it } from 'vitest';

import { canTransition, deriveStage, STAGE_LABEL } from './stage';

describe('五幕状态机', () => {
  it('合法迁移', () => {
    expect(canTransition('greet', 'clarify')).toBe(true);
    expect(canTransition('clarify', 'cast')).toBe(true);
    expect(canTransition('cast', 'interpret')).toBe(true);
    expect(canTransition('interpret', 'verdict')).toBe(true);
    expect(canTransition('verdict', 'close')).toBe(true);
    expect(canTransition(null, 'greet')).toBe(true);
  });

  it('非法迁移被拒', () => {
    expect(canTransition('greet', 'verdict')).toBe(false);
    expect(canTransition('close', 'cast')).toBe(false);
    expect(canTransition('clarify', 'close')).toBe(false);
  });

  it('派生：无卦→接问，有卦无步→起卦，有步→解卦，有断→占断', () => {
    expect(deriveStage({ case: {}, steps: [] })).toBe('greet');
    expect(deriveStage({ case: { cast: {} }, steps: [] })).toBe('cast');
    expect(deriveStage({ case: { cast: {} }, steps: [{}] })).toBe('interpret');
    expect(
      deriveStage({ case: { cast: {}, verdict: {} }, steps: [{}] }),
    ).toBe('verdict');
    expect(STAGE_LABEL.clarify).toBe('澄清');
  });
});
