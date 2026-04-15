'use client';

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';

interface HereMapsContextValue {
  isLoaded: boolean;
  loadError: string | null;
}

const HereMapsContext = createContext<HereMapsContextValue>({
  isLoaded: false,
  loadError: null,
});

declare global {
  interface Window {
    H?: any;
  }
}

const HERE_SDK_SCRIPTS = [
  'https://js.api.here.com/v3/3.1/mapsjs-core.js',
  'https://js.api.here.com/v3/3.1/mapsjs-service.js',
  'https://js.api.here.com/v3/3.1/mapsjs-ui.js',
  'https://js.api.here.com/v3/3.1/mapsjs-mapevents.js',
];

const HERE_SDK_STYLES = 'https://js.api.here.com/v3/3.1/mapsjs-ui.css';

let loadPromise: Promise<void> | null = null;

function loadHereSDK(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    // Add stylesheet
    if (!document.querySelector(`link[href="${HERE_SDK_STYLES}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = HERE_SDK_STYLES;
      document.head.appendChild(link);
    }

    // Load scripts sequentially (each depends on the previous)
    const loadNext = (index: number) => {
      if (index >= HERE_SDK_SCRIPTS.length) {
        resolve();
        return;
      }
      const src = HERE_SDK_SCRIPTS[index];
      if (document.querySelector(`script[src="${src}"]`)) {
        loadNext(index + 1);
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.type = 'text/javascript';
      script.charset = 'utf-8';
      script.onload = () => loadNext(index + 1);
      script.onerror = () => reject(new Error(`Failed to load HERE Maps script: ${src}`));
      document.head.appendChild(script);
    };

    loadNext(0);
  });
  return loadPromise;
}

export function HereMapsProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadHereSDK()
      .then(() => setIsLoaded(true))
      .catch((err) => setLoadError(err.message));
  }, []);

  return (
    <HereMapsContext.Provider value={{ isLoaded, loadError }}>
      {children}
    </HereMapsContext.Provider>
  );
}

export function useHereMaps() {
  return useContext(HereMapsContext);
}
