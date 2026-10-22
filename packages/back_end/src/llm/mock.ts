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
    return {
      text,
      json: tryParseJsonText(text),
      model: 'mock',
    };
  }
}
