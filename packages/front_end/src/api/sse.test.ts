import { describe, expect, it } from 'vitest';

import { parseFrame } from './sse';

describe('parseFrame', () => {
  it('single frame', () => {
    const { frames, rest } = parseFrame('event: done\ndata: {"a":1}\n\n');
    expect(frames).toHaveLength(1);
    expect(frames[0]!.event).toBe('done');
    expect(frames[0]!.data).toEqual({ a: 1 });
    expect(rest).toBe('');
  });

  it('skips heartbeat and unknown (step_delta)', () => {
    const buf = [
      ': ping',
      '',
      'event: step_delta',
      'data: {"x":1}',
      '',
      'event: step_done',
      'data: {"stepId":1}',
      '',
      '',
    ].join('\n');
    const { frames } = parseFrame(buf);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.event).toBe('step_done');
  });

  it('partial buffer stays in rest', () => {
    const { frames, rest } = parseFrame('event: done\ndata: {"a":1}\n');
    expect(frames).toHaveLength(0);
    expect(rest).toContain('done');
  });

  it('multi frames', () => {
    const { frames } = parseFrame(
      'event: step_done\ndata: {"stepId":1}\n\nevent: verdict\ndata: {"grade":"good"}\n\n',
    );
    expect(frames.map((f) => f.event)).toEqual(['step_done', 'verdict']);
  });
});
