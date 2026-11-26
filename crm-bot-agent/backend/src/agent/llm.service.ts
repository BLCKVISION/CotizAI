import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class AgentUnavailable extends Error {}

export type LlmMessage = Anthropic.MessageParam;
export type LlmTool = Anthropic.Tool;
export type LlmResponse = Anthropic.Message;

@Injectable()
export class LlmService {
  private log = new Logger('LLM');
  private client?: Anthropic;
  constructor(private config: ConfigService) {}

  get model() { return this.config.get<string>('ANTHROPIC_MODEL') || 'claude-sonnet-5-5'; }

  async complete(system: string, messages: LlmMessage[], tools: LlmTool[], opts: { temperature?: number } = {}): Promise<LlmResponse> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) throw new AgentUnavailable('Falta ANTHROPIC_API_KEY en el backend');
    this.client ??= new Anthropic({ apiKey });
    try {
      const temperature = opts.temperature !== undefined && opts.temperature >= 0 && opts.temperature <= 1 ? { temperature: opts.temperature } : {};
      return await this.client.messages.create({ model: this.model, max_tokens: 1024, system, messages, ...(tools.length ? { tools } : {}), ...temperature });
    } catch (e) {
      this.log.error((e as Error).message);
      throw new AgentUnavailable(`Error del modelo: ${(e as Error).message}`);
    }
  }
}
