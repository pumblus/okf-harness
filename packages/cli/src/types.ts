export type CliIo = {
  writeOut: (chunk: string) => void;
  writeErr: (chunk: string) => void;
};

export type JsonEnvelope = {
  ok: boolean;
  command: string;
  workspace?: string | null;
  data: unknown;
  warnings: Array<{ code: string; message: string }>;
  next: string[];
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};
