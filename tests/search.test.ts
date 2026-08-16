import assert from 'node:assert/strict';
import test from 'node:test';

import { matchingSnippet } from '../src/shared/search.ts';

test('search returns only the matching note line', () => {
  const note = 'A quiet morning.\nCalled Brock and caught up about Colorado.\nMade dinner.';
  assert.equal(matchingSnippet(note, 'Brock'), 'Called Brock and caught up about Colorado.');
});

test('search narrows a long line to the matching sentence', () => {
  const note = 'Work felt scattered. The afternoon walk restored my energy. Dinner was lovely.';
  assert.equal(matchingSnippet(note, 'energy'), 'The afternoon walk restored my energy.');
});
