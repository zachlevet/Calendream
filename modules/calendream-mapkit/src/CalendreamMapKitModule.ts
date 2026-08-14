import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { MapPlace, MapSuggestion } from './CalendreamMapKit.types';

declare class CalendreamMapKitModule extends NativeModule<{}> {
  suggestAsync(query: string): Promise<MapSuggestion[]>;
  resolveAsync(query: string): Promise<MapPlace>;
  openInMapsAsync(name: string, address: string, latitude: number, longitude: number): Promise<boolean>;
}

export default requireOptionalNativeModule<CalendreamMapKitModule>('CalendreamMapKit');
