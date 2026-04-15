'use client';

const STORAGE_KEY = 'tripplanner_map_provider';

export type MapProviderChoice = 'google' | 'here';

export function getStoredMapProvider(): MapProviderChoice | null {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === 'google' || val === 'here') return val;
    return null;
  } catch {
    return null;
  }
}

export function storeMapProvider(provider: MapProviderChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, provider);
  } catch {
    // ignore
  }
}

interface MapProviderPickerProps {
  onSelect: (provider: MapProviderChoice) => void;
}

export default function MapProviderPicker({ onSelect }: MapProviderPickerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/80 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 text-center animate-fade-in">
        <div className="text-5xl mb-4">🗺️</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Choose Your Map</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          You can change this later in settings. Each provider requires its own API key.
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => onSelect('google')}
            className="group flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all"
          >
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
              🌐
            </div>
            <div className="text-left flex-1">
              <p className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300">
                Google Maps
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Best accuracy · Route optimization · Requires Google Cloud key
              </p>
            </div>
            <div className="text-gray-300 dark:text-gray-500 group-hover:text-blue-400">›</div>
          </button>

          <button
            onClick={() => onSelect('here')}
            className="group flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-600 hover:border-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 transition-all"
          >
            <div className="w-12 h-12 bg-cyan-100 dark:bg-cyan-900/50 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
              📍
            </div>
            <div className="text-left flex-1">
              <p className="font-semibold text-gray-900 dark:text-white group-hover:text-cyan-700 dark:group-hover:text-cyan-300">
                HERE Maps
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Free tier (30k req/mo) · No optimization · HERE API key
              </p>
            </div>
            <div className="text-gray-300 dark:text-gray-500 group-hover:text-cyan-400">›</div>
          </button>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-6">
          Your choice is saved in your browser and can be changed in Settings
        </p>
      </div>
    </div>
  );
}
