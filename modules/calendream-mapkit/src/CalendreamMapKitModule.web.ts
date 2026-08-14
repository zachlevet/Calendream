import { registerWebModule, NativeModule } from 'expo';

import type { MapPlace, MapSuggestion } from './CalendreamMapKit.types';

// CalendreamMapKitModule is not available on the web platform.
class CalendreamMapKitModule extends NativeModule<{}> {
  async suggestAsync(_query: string): Promise<MapSuggestion[]> { return []; }
  async resolveAsync(_query: string): Promise<MapPlace> { throw new Error('MapKit is only available on Apple platforms.'); }
  async openInMapsAsync(_name: string, _address: string, _latitude: number, _longitude: number): Promise<boolean> { return false; }
}

export default registerWebModule(CalendreamMapKitModule, 'CalendreamMapKitModule') as unknown as CalendreamMapKitModule;
