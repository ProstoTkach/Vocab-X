import { describe, expect, test } from 'vitest';
import { DEFAULT_GRADING_PARAMS as params } from './config/params';
import { fastThresholdMs, gradeTypedAnswer } from './grading';
import { createBasicAdapter } from './language';

const en = createBasicAdapter('en', { optionalPrefixes: ['to', 'the', 'a', 'an'] });
const de = createBasicAdapter('de', {
  foldMap: { ß: 'ss' },
  optionalPrefixes: ['der', 'die', 'das'],
});
const es = createBasicAdapter('es');

const slow = 60_000;
const grade = (input: string, accepted: string[], adapter = en, responseMs = slow) =>
  gradeTypedAnswer({ input, accepted, responseMs, adapter, params });

describe('gradeTypedAnswer', () => {
  test('точна відповідь повільно — «Добре»', () => {
    expect(grade('journey', ['journey'])).toMatchObject({ grade: 3, verdict: 'exact' });
  });
  test('точна відповідь швидко — «Легко»', () => {
    expect(grade('journey', ['journey'], en, 1000).grade).toBe(4);
  });
  test('τ_fast залежить від довжини слова', () => {
    expect(fastThresholdMs('responsibility', params)).toBeGreaterThan(
      fastThresholdMs('go', params),
    );
  });
  test('регістр, пробіли, апострофи та NFC не важливі', () => {
    expect(grade('  Don’t ', ["don't"]).verdict).toBe('exact');
    expect(grade('Café', ['café'], es).verdict).toBe('exact');
  });
  test('необовʼязковий артикль або "to"', () => {
    expect(grade('to achieve', ['achieve']).verdict).toBe('exact');
    expect(grade('Hund', ['der Hund'], de).verdict).toBe('exact');
  });
  test('одрук із подібністю ≥ s_h — «Важко»', () => {
    expect(grade('jorney', ['journey'])).toMatchObject({ grade: 2, verdict: 'near' });
  });
  test('пропущена діакритика — «Важко», а не помилка', () => {
    expect(grade('cancion', ['canción'], es)).toMatchObject({ grade: 2, verdict: 'near' });
    expect(grade('strasse', ['Straße'], de)).toMatchObject({ grade: 2, verdict: 'near' });
  });
  test('інше слово — «Знову»', () => {
    expect(grade('travel', ['journey'])).toMatchObject({ grade: 1, verdict: 'wrong' });
  });
  test('порожня відповідь — «Знову»', () => {
    expect(grade('   ', ['journey']).grade).toBe(1);
  });
  test('обирається найближчий із прийнятих варіантів', () => {
    expect(grade('colour', ['color', 'colour'])).toMatchObject({
      verdict: 'exact',
      closest: 'colour',
    });
    expect(grade('colur', ['color', 'colour']).closest).toBe('colour');
  });
});

describe('LanguageAdapter', () => {
  test('tokenize зберігає апострофи й дефіси всередині слова', () => {
    expect(en.tokenize('I don’t know, well-known!')).toEqual(['I', "don't", 'know', 'well-known']);
  });
  test('tokenize працює з діакритикою', () => {
    expect(es.tokenize('¿Dónde está la canción?')).toEqual(['Dónde', 'está', 'la', 'canción']);
  });
});
