import assert from 'node:assert/strict';
import test from 'node:test';

import { LOCATION_SUGGESTION_LIMIT, prepareLocationSuggestions } from '../src/features/today/locationSuggestions.ts';

test('location suggestions are capped at a compact four results', () => {
  const suggestions = Array.from({ length: 7 }, (_, index) => ({
    title: `Place ${index + 1}`,
    subtitle: `Address ${index + 1}`,
  }));

  assert.equal(LOCATION_SUGGESTION_LIMIT, 4);
  assert.deepEqual(prepareLocationSuggestions(suggestions), suggestions.slice(0, 4));
});

test('location suggestions omit empty and duplicate results', () => {
  assert.deepEqual(prepareLocationSuggestions([
    { title: 'Barton Springs', subtitle: 'Austin, TX' },
    { title: ' barton springs ', subtitle: 'austin, tx' },
    { title: '', subtitle: 'No title' },
    { title: 'Zilker Park', subtitle: 'Austin, TX' },
  ]), [
    { title: 'Barton Springs', subtitle: 'Austin, TX' },
    { title: 'Zilker Park', subtitle: 'Austin, TX' },
  ]);
});
