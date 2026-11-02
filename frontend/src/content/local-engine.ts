// V6.1.4 local engine: Chrome's built-in AI (Gemini Nano). The text never
// leaves the PC and no network request is made. Feature-detected at run
// time and isolated here because these APIs are still evolving: the
// Proofreader API when present, otherwise the Prompt API with a JSON schema.
// Where it runs (this content script, an offscreen document…) is decided by
// the WP0 spike (docs/v6.1/SPIKE_REPORT.md); until measured, a context
// without the APIs simply reports "unavailable".
import {
  CheckFailure,
  type CheckFn,
  type RealtimeIssue,
} from '../shared/realtime';
import {
  REALTIME_INSTRUCTION,
  REALTIME_SCHEMA,
  parseRealtime,
  realtimeMessage,
} from '../shared/realtime-model';

export type LocalStatus =
  'ready' | 'downloadable' | 'downloading' | 'unavailable';

interface Correction {
  startIndex: number;
  endIndex: number;
  correction: string;
  type?: string;
}
interface ProofreaderSession {
  proofread(text: string): Promise<{ corrections: Correction[] }>;
}
interface PromptSession {
  prompt(
    text: string,
    options?: { responseConstraint?: unknown },
  ): Promise<string>;
  clone(): Promise<PromptSession>;
  destroy?(): void;
}
interface BuiltInAi {
  Proofreader?: {
    availability(options: unknown): Promise<string>;
    create(options: unknown): Promise<ProofreaderSession>;
  };
  LanguageModel?: {
    availability(options?: unknown): Promise<string>;
    create(options: unknown): Promise<PromptSession>;
  };
}

const asStatus = (value: string): LocalStatus =>
  value === 'available'
    ? 'ready'
    : value === 'downloadable' || value === 'downloading'
      ? value
      : 'unavailable';

/** Base language of the page ("fr-CA" → "fr"), English when unknown. */
export function pageLanguage(doc: Document): string {
  const tag = doc.documentElement.lang || doc.defaultView?.navigator.language;
  const base = (tag ?? '').split('-')[0]?.toLowerCase() ?? '';
  return /^[a-z]{2,3}$/u.test(base) ? base : 'en';
}

export class LocalEngine {
  private readonly ai: BuiltInAi;
  private proofreader?: Promise<ProofreaderSession>;
  private prompter?: Promise<PromptSession>;

  constructor(
    scope: object = globalThis,
    private readonly language = 'en',
  ) {
    this.ai = scope;
  }

  /** What the browser says about the model for this language. */
  async status(): Promise<LocalStatus> {
    try {
      if (this.ai.Proofreader)
        return asStatus(
          await this.ai.Proofreader.availability({
            expectedInputLanguages: [this.language],
          }),
        );
      if (this.ai.LanguageModel)
        return asStatus(
          await this.ai.LanguageModel.availability({
            expectedInputs: [{ type: 'text', languages: [this.language] }],
            expectedOutputs: [{ type: 'text', languages: [this.language] }],
          }),
        );
    } catch {
      return 'unavailable';
    }
    return 'unavailable';
  }

  /** Checks one sentence on this computer. Rejects while the model is not ready. */
  readonly check: CheckFn = async ({ sentence, context }) => {
    const status = await this.status();
    if (status === 'unavailable') throw new CheckFailure('ENGINE_UNAVAILABLE');
    if (status !== 'ready') {
      // Starting the download needs a real user gesture, which typing is.
      void this.open().catch(() => undefined);
      throw new CheckFailure('ENGINE_DOWNLOADING');
    }
    return this.run(sentence, context);
  };

  private open() {
    if (this.ai.Proofreader) {
      this.proofreader ??= this.ai.Proofreader.create({
        expectedInputLanguages: [this.language],
      });
      return this.proofreader;
    }
    if (this.ai.LanguageModel) {
      this.prompter ??= this.ai.LanguageModel.create({
        expectedInputs: [{ type: 'text', languages: [this.language] }],
        expectedOutputs: [{ type: 'text', languages: [this.language] }],
        initialPrompts: [{ role: 'system', content: REALTIME_INSTRUCTION }],
      });
      return this.prompter;
    }
    return Promise.reject(new CheckFailure('ENGINE_UNAVAILABLE'));
  }

  private async run(
    sentence: string,
    context: string,
  ): Promise<RealtimeIssue[]> {
    if (this.ai.Proofreader) {
      const session = (await this.open()) as ProofreaderSession;
      const { corrections } = await session.proofread(sentence);
      return corrections.map((c) => ({
        start: c.startIndex,
        end: c.endIndex,
        original: sentence.slice(c.startIndex, c.endIndex),
        suggestions: [c.correction],
        kind: c.type === 'spelling' ? 'spelling' : 'grammar',
      }));
    }
    const session = (await this.open()) as PromptSession;
    // A clone per sentence: no sentence is ever remembered by the session.
    const one = await session.clone();
    try {
      const raw = await one.prompt(realtimeMessage(sentence, context), {
        responseConstraint: REALTIME_SCHEMA,
      });
      return parseRealtime(raw, sentence) ?? [];
    } finally {
      one.destroy?.();
    }
  }
}
