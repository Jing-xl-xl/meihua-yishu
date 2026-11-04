import type { ErrorCode } from '@meihua/shared';
import { LlmError } from '@meihua/shared';

import type {
  LLMProvider,
  StreamChatRequest,
  StreamChatResult,
} from './types';
import { tryParseJsonText } from './parse';

export class MockProvider implements LLMProvider {
  readonly id = 'mock';
  queue: string[] = [];
  calls: { system: string; messages: StreamChatRequest['messages'] }[] = [];
  private failCode: ErrorCode | null = null;

  queueText(text: string): void {
    this.queue.push(text);
  }

  failNext(code: ErrorCode): void {
    this.failCode = code;
  }

  async streamChat(req: StreamChatRequest): Promise<StreamChatResult> {
    this.calls.push({ system: req.system, messages: req.messages });
    if (this.failCode) {
      const code = this.failCode;
      this.failCode = null;
      throw new LlmError(code, `mock fail: ${code}`);
    }
    const text =
      this.queue.shift() ??
      '{"conclusion":"ok","reasoningNote":"mock","sources":[]}';
    // W3：分片触发 onDelta，便于测增量渲染
    if (req.onDelta && text.length > 0) {
      const mid = Math.max(1, Math.floor(text.length / 2));
      req.onDelta(text.slice(0, mid));
      req.onDelta(text.slice(mid));
    }
    return {
      text,
      json: tryParseJsonText(text),
      model: 'mock',
    };
  }
}
