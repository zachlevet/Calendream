import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { MapPlace, MapSuggestion } from './CalendreamMapKit.types';

declare class CalendreamMapKitModule extends NativeModule<{}> {
  suggestAsync(query: string): Promise<MapSuggestion[]>;
  resolveAsync(query: string): Promise<MapPlace>;
  openInMapsAsync(name: string, address: string, latitude: number, longitude: number): Promise<boolean>;
  createJournalPDFAsync(text: string, filename: string): Promise<string>;
}

export default requireOptionalNativeModule<CalendreamMapKitModule>('CalendreamMapKit');
