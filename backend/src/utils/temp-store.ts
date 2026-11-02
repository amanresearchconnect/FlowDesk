import crypto from 'node:crypto';

interface StoredFile {
  buffer: Buffer;
  originalFileName: string;
  createdAt: number;
}

class TempFileStore {
  private files = new Map<string, StoredFile>();
  private readonly ttlMs = 30 * 60 * 1000; // 30 minutes

  constructor() {
    // Periodic cleanup of expired tokens every 10 minutes
    setInterval(() => this.cleanup(), 10 * 60 * 1000).unref();
  }

  public save(buffer: Buffer, originalFileName: string): string {
    const token = `tmp_${crypto.randomBytes(16).toString('hex')}`;
    this.files.set(token, {
      buffer,
      originalFileName,
      createdAt: Date.now()
    });
    return token;
  }

  public get(token: string): StoredFile | null {
    const item = this.files.get(token);
    if (!item) return null;
    if (Date.now() - item.createdAt > this.ttlMs) {
      this.files.delete(token);
      return null;
    }
    return item;
  }

  public delete(token: string): void {
    this.files.delete(token);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [token, item] of this.files.entries()) {
      if (now - item.createdAt > this.ttlMs) {
        this.files.delete(token);
      }
    }
  }
}

export const tempFileStore = new TempFileStore();
