'use client';

import { Loader } from '@googlemaps/js-api-loader';
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';

interface GoogleMapsContextValue {
  isLoaded: boolean;
  loadError: string | null;
}

const GoogleMapsContext = createContext<GoogleMapsContextValue>({
  isLoaded: false,
  loadError: null,
});

let initPromise: Promise<void> | null = null;

async function initGoogleMaps(apiKey: string): Promise<void> {
  const loader = new Loader({
    apiKey,
    version: 'weekly',
  });

  // Load all required libraries using the new importLibrary pattern
  await Promise.all([
    loader.importLibrary('maps'),
    loader.importLibrary('places'),
    loader.importLibrary('geometry'),
    loader.importLibrary('marker'),
  ]);
}

export function GoogleMapsProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey || apiKey === 'your_google_maps_api_key_here') {
      setLoadError(
        'Google Maps API key is not configured. Please set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your .env.local file.'
      );
      return;
    }

    if (!initPromise) {
      initPromise = initGoogleMaps(apiKey);
    }

    initPromise
      .then(() => setIsLoaded(true))
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : 'Failed to load Google Maps')
      );
  }, []);

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

export function useGoogleMaps() {
  return useContext(GoogleMapsContext);
}
