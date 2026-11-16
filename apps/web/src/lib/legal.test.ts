import { describe, expect, it } from 'vitest';
import enLegal from '../../messages/en/legal.json';
import ukLegal from '../../messages/uk/legal.json';
import { groupBlocks, splitText } from './legal';

describe('groupBlocks', () => {
  it('keeps order and gathers consecutive items into one list', () => {
    expect(groupBlocks({ p1: 'a', li1: 'b', li2: 'c', p2: 'd', li3: 'e' })).toEqual([
      { kind: 'p', key: 'p1', text: 'a' },
      { kind: 'ul', items: ['b', 'c'] },
      { kind: 'p', key: 'p2', text: 'd' },
      { kind: 'ul', items: ['e'] },
    ]);
  });
  it('refuses an unknown key', () => {
    expect(() => groupBlocks({ x1: 'a' })).toThrow();
  });
});

describe('splitText', () => {
  it('links the first mention of a service and fills the e-mail', () => {
    expect(splitText('Vercel and Vercel, write {email}.')).toEqual([
      { kind: 'link', text: 'Vercel', href: 'https://vercel.com' },
      { kind: 'text', text: ' and Vercel, write ' },
      { kind: 'email' },
      { kind: 'text', text: '.' },
    ]);
  });
  it('prefers the longer name', () => {
    const [piece] = splitText('Google Translate');
    expect(piece).toMatchObject({ text: 'Google Translate', href: 'https://translate.google.com' });
  });
  it('leaves plain text alone', () => {
    expect(splitText('nothing here')).toEqual([{ kind: 'text', text: 'nothing here' }]);
  });
});

describe('legal texts', () => {
  for (const [lang, legal] of [
    ['uk', ukLegal],
    ['en', enLegal],
  ] as const)
    it(`${lang}: every section has a title and blocks the page can render`, () => {
      for (const doc of [legal.privacy, legal.terms])
        for (const section of Object.values(doc.sections)) {
          expect(section.title).toBeTruthy();
          expect(() => groupBlocks(section.blocks)).not.toThrow();
        }
    });
});
