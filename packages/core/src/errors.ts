/** Persistent storage is full. The UI should suggest exporting data or trimming history. */
export class StorageQuotaError extends Error {
  override readonly name = 'StorageQuotaError';
  constructor(
    readonly key: string,
    options?: { cause?: unknown },
  ) {
    super(`Storage quota exceeded while writing "${key}"`, options);
  }
}

export type ImportErrorCode =
  'invalid_json' | 'not_vocabx' | 'unsupported_version' | 'invalid_data';

export class ImportError extends Error {
  override readonly name = 'ImportError';
  constructor(
    readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
  }
}
