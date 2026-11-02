export type ErrorCode =
  | 'NOT_CONFIGURED'
  | 'ROUTE_BROKEN'
  | 'PROFILE_DISABLED'
  | 'ROUTE_CHANGED'
  | 'INVALID_KEY'
  | 'PERMISSION_DENIED'
  | 'MODEL_UNAVAILABLE'
  | 'MODEL_INCOMPATIBLE'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'AI_PAUSED'
  | 'QUOTA_UNAVAILABLE'
  | 'CLOCK_CHANGED'
  | 'CONSENT_REQUIRED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'RESPONSE_LOST'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE'
  | 'RESPONSE_REFUSED'
  | 'STORAGE_ERROR'
  // V7.1: text from a screen area (image sent to the provider).
  | 'CAPTURE_FAILED'
  | 'CAPTURE_FORBIDDEN'
  | 'AREA_TOO_SMALL'
  | 'NO_TEXT_FOUND'
  | 'MODEL_NO_VISION'
  | 'IMAGE_CONSENT_REQUIRED'
  | 'UNKNOWN_ERROR';

const SETTINGS = 'Correctly settings → AI providers';

// Fixed, user-facing copy. Provider text is never shown verbatim.
const COPY: Record<ErrorCode, { message: string; retryable: boolean }> = {
  NOT_CONFIGURED: {
    message: `No AI provider is set up for this action. Add an API key and choose a model in ${SETTINGS}.`,
    retryable: false,
  },
  ROUTE_BROKEN: {
    message: `The API key chosen for this action was deleted or is incomplete. Choose another one in ${SETTINGS}. No other key was used.`,
    retryable: false,
  },
  PROFILE_DISABLED: {
    message: `The API key chosen for this action is disabled. Enable it or choose another one in ${SETTINGS}. No other key was used.`,
    retryable: false,
  },
  ROUTE_CHANGED: {
    message:
      'The API key for this request was changed or deleted while it was running, so the request was stopped. It may still count toward provider billing.',
    retryable: false,
  },
  INVALID_KEY: {
    message: `The provider rejected this API key. Replace or check it in ${SETTINGS}.`,
    retryable: false,
  },
  PERMISSION_DENIED: {
    message:
      'The provider refused this request for your key or project (API disabled, key restrictions, region or billing). Check your provider dashboard.',
    retryable: false,
  },
  MODEL_UNAVAILABLE: {
    message: `This model is not available for this key. Choose another model in ${SETTINGS}. No other model was used.`,
    retryable: false,
  },
  MODEL_INCOMPATIBLE: {
    message: `This model does not accept the options Correctly needs (structured JSON output). Choose another model in ${SETTINGS}.`,
    retryable: false,
  },
  RATE_LIMITED: {
    message:
      'The provider is rate-limiting requests, or your quota or billing limit at the provider is reached (this is not a Correctly usage limit). No automatic switch was made; retry later.',
    retryable: true,
  },
  QUOTA_EXCEEDED: {
    message:
      'A Correctly usage limit is reached, so no request was sent. See Correctly settings → Usage limits.',
    retryable: false,
  },
  AI_PAUSED: {
    message:
      'AI requests are paused in Correctly settings → Usage limits. No request was sent. Text shortcuts still work.',
    retryable: false,
  },
  QUOTA_UNAVAILABLE: {
    message:
      'Correctly cannot verify your usage limits right now. No AI request was sent. Open Correctly settings → Usage limits.',
    retryable: true,
  },
  CLOCK_CHANGED: {
    message:
      "Your computer's clock moved back, so AI requests are paused until you confirm the time in Correctly settings → Usage limits. No request was sent.",
    retryable: false,
  },
  CONSENT_REQUIRED: {
    message:
      'Allow sending selected text to your AI provider in the Correctly settings first.',
    retryable: false,
  },
  NETWORK_ERROR: {
    message: 'Offline or network error — check your internet connection.',
    retryable: true,
  },
  TIMEOUT: {
    message:
      'The provider did not answer in time. The request may still count toward provider billing; retry only if you want to make another request.',
    retryable: true,
  },
  // V5.10: the connection failed after the "sent" mark (offline before
  // sending stays NETWORK_ERROR and is not counted).
  RESPONSE_LOST: {
    message:
      'The connection was lost after the request was sent. The provider may have received it, so it may count toward provider billing; retry only if you want to make another request.',
    retryable: true,
  },
  PROVIDER_ERROR: {
    message:
      'The provider returned an error. Try again later; if it persists, check your provider dashboard.',
    retryable: true,
  },
  INVALID_RESPONSE: {
    message:
      'The provider answered, but the response was not usable (incomplete or malformed). Nothing was confirmed or changed.',
    retryable: true,
  },
  RESPONSE_REFUSED: {
    message: 'The provider declined to process this text. Nothing was changed.',
    retryable: false,
  },
  STORAGE_ERROR: {
    message:
      'Browser storage could not be read or written. Reload this page and try again.',
    retryable: true,
  },
  CAPTURE_FAILED: {
    message:
      'The screenshot could not be taken (the tab must be visible and in front). Nothing was sent. Try again.',
    retryable: true,
  },
  CAPTURE_FORBIDDEN: {
    message:
      'Chrome does not allow capturing this page. Nothing was sent. Open the Correctly window with the toolbar icon or Ctrl+M on this page, then try again.',
    retryable: false,
  },
  AREA_TOO_SMALL: {
    message: 'The selected area is too small. Nothing was sent.',
    retryable: true,
  },
  NO_TEXT_FOUND: {
    message: 'No text found in this area.',
    retryable: true,
  },
  MODEL_NO_VISION: {
    message: `This model cannot read images. Choose another for “Text from image” in ${SETTINGS}. Nothing was sent.`,
    retryable: false,
  },
  IMAGE_CONSENT_REQUIRED: {
    message:
      'Allow sending an image of the selected area to your AI provider in the Correctly settings first. Nothing was sent.',
    retryable: false,
  },
  UNKNOWN_ERROR: {
    message: 'Something unexpected went wrong. Reload this page and try again.',
    retryable: true,
  },
};

export const ERROR_CODES = Object.keys(COPY) as ErrorCode[];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(COPY, value);
}

export function errorMessage(code: ErrorCode): string {
  return COPY[code].message;
}

export function isRetryable(code: ErrorCode): boolean {
  return COPY[code].retryable;
}

export class CorrectlyError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'CorrectlyError';
  }
}
