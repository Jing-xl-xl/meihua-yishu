import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import { bindClientDisconnect } from './disconnect';

class FakeRes extends EventEmitter {
  /** 响应是否已正常 end（结束后 close 不算断开） */
  writableEnded = false;
}

describe('bindClientDisconnect', () => {
  it('响应未结束时 close → abort（真实断开）', () => {
    const res = new FakeRes();
    const ac = new AbortController();
    bindClientDisconnect(res, ac);
    expect(ac.signal.aborted).toBe(false);
    res.emit('close');
    expect(ac.signal.aborted).toBe(true);
  });

  it('响应已 end 后的 close → 不 abort（正常完成）', () => {
    const res = new FakeRes();
    const ac = new AbortController();
    bindClientDisconnect(res, ac);
    res.writableEnded = true;
    res.emit('close');
    expect(ac.signal.aborted).toBe(false);
  });

  it('error → abort', () => {
    const res = new FakeRes();
    const ac = new AbortController();
    bindClientDisconnect(res, ac);
    res.emit('error');
    expect(ac.signal.aborted).toBe(true);
  });
});
