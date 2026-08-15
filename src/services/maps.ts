import { Linking } from 'react-native';

import CalendreamMapKit from '../../modules/calendream-mapkit/src/CalendreamMapKitModule';
import type { PlanningItem } from '@/models/planning';

export async function openItemInMaps(item: PlanningItem) {
  if (!item.location) return;

  if (CalendreamMapKit && item.locationPlace) {
    const place = item.locationPlace;
    await CalendreamMapKit.openInMapsAsync(
      place.name,
      place.address,
      place.latitude,
      place.longitude,
    );
    return;
  }

  const query = encodeURIComponent(item.location);
  await Linking.openURL(`http://maps.apple.com/?q=${query}`);
}
