/** SSE 帧解析（纯函数，可测） */
export type SseFrame = { event: string; data: unknown };

export function parseFrame(buffer: string): {
  frames: SseFrame[];
  rest: string;
} {
  const frames: SseFrame[] = [];
  let rest = buffer;
  for (;;) {
    const idx = rest.indexOf('\n\n');
    if (idx < 0) break;
    const chunk = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    if (chunk.startsWith(':')) continue; // 心跳
    let event = 'message';
    let data = '';
    for (const line of chunk.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!event && !data) continue;
    let parsed: unknown = data;
    if (data) {
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = data;
      }
    }
    // V1：忽略 step_delta 等未知
    const known = new Set([
      'route',
      'cast',
      'step_start',
      'step_done',
      'step_revised',
      'need_input',
      'verdict',
      'memory_written',
      'error',
      'done',
    ]);
    if (!known.has(event)) continue;
    frames.push({ event, data: parsed });
  }
  return { frames, rest };
}

export async function streamSse(
  url: string,
  body: unknown,
  onFrame: (f: SseFrame) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const { frames, rest } = parseFrame(buf);
    buf = rest;
    for (const f of frames) onFrame(f);
  }
}
