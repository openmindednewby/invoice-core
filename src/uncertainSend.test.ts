import { describe, expect, it } from 'vitest';

import { createMemoryStorage } from './memoryStorage';
import { clearUncertainSend, markUncertainSend, readUncertainSend } from './uncertainSend';

const NUMBER = '2030-001';
const FILE = `send-uncertain/${NUMBER}.json`;
const AT = '2030-10-09T08:00:00.000Z';

describe('markUncertainSend', () => {
  it('with a send of unknown outcome, keeps its time in send-uncertain/<number>.json', async () => {
    const storage = createMemoryStorage();

    await markUncertainSend(storage, NUMBER, AT);

    expect(await storage.readText(FILE)).toBe(JSON.stringify({ at: AT }));
    expect(await readUncertainSend(storage, NUMBER)).toBe(AT);
  });
});

describe('readUncertainSend', () => {
  it('with no file, returns null', async () => {
    const storage = createMemoryStorage();

    const at = await readUncertainSend(storage, NUMBER);

    expect(at).toBeNull();
  });

  it('with a damaged file, still counts as uncertain so nothing is resent on a guess', async () => {
    const storage = createMemoryStorage({ [FILE]: 'not json' });

    const at = await readUncertainSend(storage, NUMBER);

    expect(at).toBe('');
  });

  it('with a file whose time is not a date, still counts as uncertain with no time', async () => {
    const storage = createMemoryStorage({ [FILE]: JSON.stringify({ at: 'yesterday' }) });

    const at = await readUncertainSend(storage, NUMBER);

    expect(at).toBe('');
  });

  it('with a marker the web app wrote, reads the same time', async () => {
    const storage = createMemoryStorage({ [FILE]: '{"at":"2030-10-09T08:00:00.000Z"}' });

    const at = await readUncertainSend(storage, NUMBER);

    expect(at).toBe(AT);
  });
});

describe('clearUncertainSend', () => {
  it('with an outcome on file, removes it', async () => {
    const storage = createMemoryStorage();
    await markUncertainSend(storage, NUMBER, AT);

    await clearUncertainSend(storage, NUMBER);

    expect(await readUncertainSend(storage, NUMBER)).toBeNull();
  });
});
