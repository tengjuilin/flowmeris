import type { SampleData, StorageAdapter } from './types.ts';

/** In-memory storage (tests, and browsers without OPFS). */
export class MemoryStorage implements StorageAdapter {
  private data = new Map<string, SampleData>();
  put(s: SampleData): void {
    this.data.set(s.sampleId, s);
  }
  async loadSample(id: string): Promise<SampleData> {
    const s = this.data.get(id);
    if (!s) throw new Error(`Sample ${id} is not loaded`);
    return s;
  }
}
