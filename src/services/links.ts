import { Alert, Linking } from 'react-native';

export function normalizeWebUrl(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function openMeetingUrl(value?: string) {
  const url = normalizeWebUrl(value);
  if (!url) {
    Alert.alert('Link unavailable', 'Add a valid meeting link first.');
    return;
  }
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Couldn’t open link', 'Calendream could not open this meeting link.');
  }
}
