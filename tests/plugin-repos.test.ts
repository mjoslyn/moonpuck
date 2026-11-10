import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { lastSplit, nameFromRepo, readManifest, validName, writeManifest } from '../scripts/lib/plugin-repos';

describe('plugin repositories', () => {
  it('names a plugin from its repository', () => {
    expect(nameFromRepo('https://github.com/mjoslyn/moonpuck-plugin-square-sync.git')).toBe('square-sync');
    expect(nameFromRepo('git@github.com:someone/Bookings.git')).toBe('bookings');
    expect(nameFromRepo('/home/me/plugins/alpha/')).toBe('alpha');
    expect(validName('square-sync')).toBe(true);
    expect(validName('Square_Sync')).toBe(false);
  });

  it('reads and writes the manifest, the ref main by default', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-')), 'plugins.json');
    expect(readManifest(file)).toEqual({});
    writeManifest({ zeta: { repo: 'z', ref: 'v1' }, alpha: { repo: 'a', ref: 'main' } }, file);
    expect(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')))).toEqual(['alpha', 'zeta']);
    fs.writeFileSync(file, JSON.stringify({ beta: { repo: 'b' } }));
    expect(readManifest(file)).toEqual({ beta: { repo: 'b', ref: 'main' } });
    fs.writeFileSync(file, JSON.stringify({ beta: {} }));
    expect(() => readManifest(file)).toThrow(/needs/);
  });

  it("finds the plugin commit a subtree last took in, the newest first, for that folder only", () => {
    const log = [
      "Squashed 'src/site/plugins/alpha/' changes from 111..222\n\ngit-subtree-dir: src/site/plugins/alpha\ngit-subtree-split: 2222222222222222222222222222222222222222\n",
      "Squashed 'src/site/plugins/alpha-two/' content\n\ngit-subtree-dir: src/site/plugins/alpha-two\ngit-subtree-split: 3333333333333333333333333333333333333333\n",
      "Squashed 'src/site/plugins/alpha/' content\n\ngit-subtree-dir: src/site/plugins/alpha\ngit-subtree-split: 1111111111111111111111111111111111111111",
    ].join('\x00');
    expect(lastSplit(log, 'src/site/plugins/alpha')).toBe('2222222222222222222222222222222222222222');
    expect(lastSplit(log, 'src/site/plugins/alpha-two')).toBe('3333333333333333333333333333333333333333');
    expect(lastSplit(log, 'src/site/plugins/beta')).toBeNull();
  });
});
