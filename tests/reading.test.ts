import { describe, expect, it, vi } from 'vitest';
import {
  IPA_VOICES,
  createIpaReading,
  ipaVoiceFor,
  pairPhonesWithPhrases,
  splitPhrases,
} from '../core/reading/ipa';
import { buildJaReading, createJaTokens, isFuriganaReadable, type JaMorphToken } from '../core/reading/ja';
import { createKoTokens, createKoReading, resolveHangulConverter, romanizeHangul } from '../core/reading/ko';
import {
  chooseReadingProvider,
  describeProvider,
  isProviderEnabled,
  readingProviderLanguages,
} from '../core/reading/registry';
import { joinTokens, summarizeReading } from '../core/reading/shared';
import { createZhReading, createZhTokens } from '../core/reading/zh';

describe('chinese readings', () => {
  it('pairs each character with toned and toneless pinyin', () => {
    const tokens = createZhTokens('世界');
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toEqual({ text: '世', reading: 'shì', roman: 'shi' });
    expect(tokens[1]).toEqual({ text: '界', reading: 'jiè', roman: 'jie' });
  });

  it('keeps non chinese characters unread', () => {
    expect(createZhTokens('Hi 你')[0]).toEqual({ text: 'H' });
  });

  it('builds the whole-text reading and romanization', () => {
    const reading = createZhReading('世界');
    expect(reading.provider).toBe('zh-pinyin');
    expect(reading.language).toBe('zh');
    expect(reading.reading).toBe('shì jiè');
    expect(reading.romanization).toBe('shi jie');
  });

  it('keeps the regional language tag it was given', () => {
    expect(createZhReading('世界', 'zh-Hans').language).toBe('zh-Hans');
  });
});

describe('korean readings', () => {
  it('romanizes hangul with the revised romanization', () => {
    expect(romanizeHangul('안녕하세요')).toBe('annyeonghaseyo');
  });

  it('leaves non hangul chunks alone', () => {
    const tokens = createKoTokens('hello 안녕');
    expect(tokens.map((token) => token.text)).toEqual(['hello', ' ', '안녕']);
    expect(tokens[0]).toEqual({ text: 'hello' });
    expect(tokens[2]).toEqual({ text: '안녕', roman: 'annyeong' });
  });

  it('joins the romaja into the romanization', () => {
    const reading = createKoReading('안녕하세요');
    expect(reading.provider).toBe('ko-romaja');
    expect(reading.romanization).toBe('annyeonghaseyo');
    expect(reading.reading).toBe('');
  });

  it('finds the converter on every CommonJS interop shape', () => {
    const convert = (text: string) => `c(${text})`;
    expect(resolveHangulConverter({ convert })).toBe(convert);
    expect(resolveHangulConverter({ default: convert })).toBe(convert);
    expect(resolveHangulConverter({ default: { convert } })).toBe(convert);
    expect(resolveHangulConverter({ __esModule: true })).toBeNull();
    expect(resolveHangulConverter(null)).toBeNull();
  });
});

describe('japanese readings', () => {
  const sentence: JaMorphToken[] = [
    { surface_form: '学校', reading: 'ガッコウ', pos: '名詞' },
    { surface_form: 'へ', reading: 'ヘ', pos: '助詞' },
    { surface_form: '。', reading: '。', pos: '記号' },
  ];

  it('converts kuromoji katakana readings into furigana and romaji', () => {
    const tokens = createJaTokens(sentence);
    expect(tokens[0]).toEqual({ text: '学校', reading: 'がっこう', roman: 'gakkou' });
    expect(tokens[1]).toEqual({ text: 'へ', reading: 'へ', roman: 'he' });
  });

  it('leaves punctuation unread', () => {
    expect(createJaTokens(sentence)[2]).toEqual({ text: '。' });
  });

  it('reads katakana words even when kuromoji echoes the surface form', () => {
    expect(createJaTokens([{ surface_form: 'カタカナ', reading: 'カタカナ' }])[0]).toEqual({
      text: 'カタカナ',
      reading: 'かたかな',
      roman: 'katakana',
    });
  });

  it('keeps the furigana for kana surfaces', () => {
    expect(createJaTokens([{ surface_form: 'がっこう', reading: 'ガッコウ' }])[0]).toEqual({
      text: 'がっこう',
      reading: 'がっこう',
      roman: 'gakkou',
    });
  });

  it('ignores readings that cannot become furigana', () => {
    expect(isFuriganaReadable({ surface_form: '学校', reading: '*' })).toBe(false);
    expect(isFuriganaReadable({ surface_form: '学校' })).toBe(false);
    expect(isFuriganaReadable({ surface_form: '学校', reading: '学校' })).toBe(false);
    expect(isFuriganaReadable({ surface_form: '学校', reading: 'ガッコウ' })).toBe(true);
  });

  it('builds the reading for the whole sentence', () => {
    const reading = buildJaReading(sentence);
    expect(reading.provider).toBe('ja-furigana');
    expect(reading.reading).toBe('がっこう へ');
    expect(reading.romanization).toBe('gakkou he');
  });
});

describe('ipa readings', () => {
  it('maps language tags to espeak voices', () => {
    expect(ipaVoiceFor('en-US')).toBe('en-us');
    expect(ipaVoiceFor('de')).toBe('de');
    expect(ipaVoiceFor('fr-CA')).toBe('fr-fr');
    expect(ipaVoiceFor('vi')).toBeNull();
    expect(Object.keys(IPA_VOICES)).toEqual(['en', 'de', 'fr']);
  });

  it('splits text into phrases and drops blank ones', () => {
    expect(splitPhrases('Hi. Bye!')).toEqual(['Hi.', 'Bye!']);
    expect(splitPhrases('   ')).toEqual([]);
  });

  it('pairs the phones with the phrases when the counts line up', () => {
    expect(pairPhonesWithPhrases('Hi. Bye!', ['haɪ', 'baɪ'])).toEqual([
      { text: 'Hi.', roman: 'haɪ' },
      { text: 'Bye!', roman: 'baɪ' },
    ]);
  });

  it('falls back to a single token when they do not', () => {
    expect(pairPhonesWithPhrases('Hi. Bye!', ['haɪ'])).toEqual([{ text: 'Hi. Bye!', roman: 'haɪ' }]);
  });

  it('asks the phonemizer for the voice espeak understands', async () => {
    const phonemize = vi.fn(async (_text: string, _voice?: string) => ['həˈloʊ']);
    const reading = await createIpaReading('Hello', 'en', phonemize);

    expect(phonemize).toHaveBeenCalledWith('Hello', 'en-us');
    expect(reading?.provider).toBe('ipa');
    expect(reading?.language).toBe('en');
    expect(reading?.tokens).toEqual([{ text: 'Hello', roman: 'həˈloʊ' }]);
    expect(reading?.romanization).toBe('həˈloʊ');
  });

  it('keeps every phrase when the phonemizer returns one entry per sentence', async () => {
    const reading = await createIpaReading('Hi. Bye!', 'en', async () => ['haɪ', 'baɪ']);
    expect(reading?.tokens.map((token) => token.text)).toEqual(['Hi.', 'Bye!']);
    expect(reading?.romanization).toBe('haɪ baɪ');
  });

  it('returns null for languages without a voice', async () => {
    const phonemize = vi.fn(async () => ['sin tɕaːw']);
    expect(await createIpaReading('Xin chào', 'vi', phonemize)).toBeNull();
    expect(phonemize).not.toHaveBeenCalled();
  });

  it('returns null when the phonemizer produced nothing', async () => {
    expect(await createIpaReading('…', 'en', async () => [])).toBeNull();
  });
});

describe('the reading registry', () => {
  it('picks a provider per language', () => {
    expect(chooseReadingProvider('zh-Hans')).toBe('zh-pinyin');
    expect(chooseReadingProvider('cmn')).toBe('zh-pinyin');
    expect(chooseReadingProvider('ja')).toBe('ja-furigana');
    expect(chooseReadingProvider('ko-KR')).toBe('ko-romaja');
    expect(chooseReadingProvider('en-US')).toBe('ipa');
    expect(chooseReadingProvider('vi')).toBeNull();
  });

  it('gates the IPA provider behind the opt-in', () => {
    expect(isProviderEnabled('ipa', false)).toBe(false);
    expect(isProviderEnabled('ipa', true)).toBe(true);
    expect(isProviderEnabled('zh-pinyin', false)).toBe(true);
    expect(isProviderEnabled('ko-romaja', false)).toBe(true);
  });

  it('labels the providers and lists the languages it covers', () => {
    expect(describeProvider('ja-furigana')).toBe('Furigana + romaji');
    expect(describeProvider('ipa')).toBe('IPA');
    expect(readingProviderLanguages()).toContain('ko');
  });
});

describe('readings built from tokens', () => {
  it('joins only the tokens that have the field', () => {
    expect(joinTokens([{ text: 'a' }, { text: 'b', roman: 'bi' }], 'roman')).toBe('bi');
    expect(joinTokens([{ text: 'a' }, { text: 'b' }], 'roman')).toBe('');
  });

  it('prefers romanization when the user asked for it', () => {
    const reading = createZhReading('世界');
    expect(summarizeReading(reading, true)).toBe('shi jie');
    expect(summarizeReading(reading, false)).toBe('shì jiè');
  });
});
