import { Injectable } from '@angular/core';
import { decryptEntry, lookupId, type DecryptRequest, type Pairing, type PairsFile } from './wichtel-crypto';

export type RevealError = 'invalid' | 'network' | 'insecure';

export class RevealFailure extends Error {
  constructor(readonly reason: RevealError) {
    super(reason);
  }
}

@Injectable({ providedIn: 'root' })
export class WichtelService {
  private pairs?: Promise<PairsFile>;

  /** Lädt die Paarungsdatei. Wird früh aufgerufen, damit sie beim Aufdecken schon da ist. */
  prefetch(): Promise<PairsFile> {
    this.pairs ??= fetch(new URL('data/pairs.json', document.baseURI), { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new RevealFailure('network');
      return r.json() as Promise<PairsFile>;
    });
    this.pairs.catch(() => (this.pairs = undefined));
    return this.pairs;
  }

  async reveal(code: string): Promise<Pairing> {
    if (!globalThis.crypto?.subtle) throw new RevealFailure('insecure');
    let file: PairsFile;
    try {
      file = await this.prefetch();
    } catch {
      throw new RevealFailure('network');
    }
    const entry = file.entries[await lookupId(code)];
    if (!entry) throw new RevealFailure('invalid');
    try {
      return await this.decrypt({ code, entry, iterations: file.iterations });
    } catch {
      throw new RevealFailure('invalid');
    }
  }

  /** PBKDF2 im Web Worker, damit die UI auf langsamen Handys nicht einfriert. */
  private decrypt(req: DecryptRequest): Promise<Pairing> {
    if (typeof Worker === 'undefined') return decryptEntry(req);
    return new Promise<Pairing>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('./decrypt.worker', import.meta.url), { type: 'module' });
      } catch {
        decryptEntry(req).then(resolve, reject);
        return;
      }
      worker.onmessage = ({ data }) => {
        worker.terminate();
        data.ok ? resolve(data.pairing) : reject(new Error('decrypt'));
      };
      worker.onerror = () => {
        // z. B. alte WebViews ohne Module-Worker: im Hauptthread weitermachen
        worker.terminate();
        decryptEntry(req).then(resolve, reject);
      };
      worker.postMessage(req);
    });
  }
}
