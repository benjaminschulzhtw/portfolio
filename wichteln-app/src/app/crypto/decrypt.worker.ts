// Läuft als Dedicated Worker; die DOM-Typen für addEventListener/postMessage passen hier.
import { decryptEntry, type DecryptRequest } from './wichtel-crypto';

addEventListener('message', async ({ data }: MessageEvent<DecryptRequest>) => {
  try {
    postMessage({ ok: true, pairing: await decryptEntry(data) });
  } catch {
    postMessage({ ok: false });
  }
});
