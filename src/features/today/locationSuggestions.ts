import type { MapSuggestion } from '../../../modules/calendream-mapkit/src/CalendreamMapKit.types';

export const LOCATION_SUGGESTION_LIMIT = 4;

export function prepareLocationSuggestions(
  suggestions: MapSuggestion[],
  limit = LOCATION_SUGGESTION_LIMIT,
) {
  const seen = new Set<string>();

  return suggestions.filter((suggestion) => {
    const title = suggestion.title.trim();
    const subtitle = suggestion.subtitle.trim();
    const key = `${title.toLocaleLowerCase()}\u0000${subtitle.toLocaleLowerCase()}`;

    if (!title || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}
