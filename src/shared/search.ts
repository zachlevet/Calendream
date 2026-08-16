export function matchingSnippet(value: string | null | undefined, query: string) {
  if (!value?.trim()) return undefined;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return undefined;

  const lines = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const matchingLine = lines.find((line) => line.toLocaleLowerCase().includes(normalizedQuery));
  if (!matchingLine) return undefined;

  const sentences = matchingLine.split(/(?<=[.!?])\s+/);
  return sentences.find((sentence) => sentence.toLocaleLowerCase().includes(normalizedQuery)) ?? matchingLine;
}
