'use client';

import { TripSettings } from '@/lib/types';
import { MapProviderChoice } from './MapProviderPicker';

interface TripSettingsProps {
  settings: TripSettings;
  onChange: (settings: TripSettings) => void;
  disabled?: boolean;
  currentMapProvider?: MapProviderChoice;
  onChangeMapProvider?: () => void;
}

export default function TripSettingsPanel({
  settings,
  onChange,
  disabled = false,
  currentMapProvider,
  onChangeMapProvider,
}: TripSettingsProps) {
  const update = (partial: Partial<TripSettings>) => {
    onChange({ ...settings, ...partial });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Trip Settings
      </h3>

      {onChangeMapProvider && (
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
              Map provider
            </p>
            <p className="text-sm font-semibold text-gray-800 dark:text-white capitalize">
              {currentMapProvider === 'here' ? '📍 HERE Maps' : '🌐 Google Maps'}
            </p>
          </div>
          <button
            onClick={onChangeMapProvider}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            Change
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Max driving hours */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Max driving/day
          </label>
          <div className="relative">
            <select
              value={settings.maxDrivingMinutesPerDay}
              onChange={(e) =>
                update({ maxDrivingMinutesPerDay: Number(e.target.value) })
              }
              disabled={disabled}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg 
                         focus:outline-none focus:ring-2 focus:ring-primary-500 
                         disabled:bg-gray-100 appearance-none bg-white"
            >
              <option value={240}>4 hours</option>
              <option value={300}>5 hours</option>
              <option value={360}>6 hours</option>
              <option value={420}>7 hours</option>
              <option value={480}>8 hours</option>
              <option value={540}>9 hours</option>
              <option value={600}>10 hours</option>
            </select>
            <svg
              className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Max distance per day */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Max km/day
          </label>
          <input
            type="number"
            value={settings.maxDistancePerDayKm}
            onChange={(e) =>
              update({ maxDistancePerDayKm: Number(e.target.value) })
            }
            min={100}
            max={1500}
            step={50}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg 
                       focus:outline-none focus:ring-2 focus:ring-primary-500 
                       disabled:bg-gray-100"
          />
        </div>

        {/* Fuel range */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Fuel range (km)
          </label>
          <input
            type="number"
            value={settings.fuelRangeKm}
            onChange={(e) => update({ fuelRangeKm: Number(e.target.value) })}
            min={100}
            max={1200}
            step={50}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg 
                       focus:outline-none focus:ring-2 focus:ring-primary-500 
                       disabled:bg-gray-100"
          />
        </div>

        {/* Departure date */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Departure date
          </label>
          <input
            type="date"
            value={settings.departureDate}
            onChange={(e) => update({ departureDate: e.target.value })}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg 
                       focus:outline-none focus:ring-2 focus:ring-primary-500 
                       disabled:bg-gray-100"
          />
        </div>

        {/* Checkout time */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            🧳 Checkout by
          </label>
          <input
            type="time"
            value={settings.checkoutTime}
            onChange={(e) => update({ checkoutTime: e.target.value })}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg 
                       focus:outline-none focus:ring-2 focus:ring-primary-500 
                       disabled:bg-gray-100"
          />
        </div>

        {/* Check-in time */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            🏨 Check-in from
          </label>
          <input
            type="time"
            value={settings.checkinTime}
            onChange={(e) => update({ checkinTime: e.target.value })}
            disabled={disabled}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg 
                       focus:outline-none focus:ring-2 focus:ring-primary-500 
                       disabled:bg-gray-100"
          />
        </div>

        {/* Sightseeing time per stop */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            🚶 Walk per stop
          </label>
          <div className="relative">
            <select
              value={settings.sightseeingMinutesPerStop}
              onChange={(e) =>
                update({ sightseeingMinutesPerStop: Number(e.target.value) })
              }
              disabled={disabled}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg 
                         focus:outline-none focus:ring-2 focus:ring-primary-500 
                         disabled:bg-gray-100 appearance-none bg-white"
            >
              <option value={0}>Skip</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
              <option value={180}>3 hours</option>
              <option value={240}>4 hours</option>
            </select>
            <svg
              className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Rest day interval */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            🌿 Rest day every
          </label>
          <div className="relative">
            <select
              value={settings.restDayEvery}
              onChange={(e) =>
                update({ restDayEvery: Number(e.target.value) })
              }
              disabled={disabled}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg 
                         focus:outline-none focus:ring-2 focus:ring-primary-500 
                         disabled:bg-gray-100 appearance-none bg-white"
            >
              <option value={0}>Never</option>
              <option value={2}>2 days</option>
              <option value={3}>3 days</option>
              <option value={4}>4 days</option>
              <option value={5}>5 days</option>
            </select>
            <svg
              className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Toggle options */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.avoidTolls}
            onChange={(e) => update({ avoidTolls: e.target.checked })}
            disabled={disabled}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 
                       focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">Avoid toll roads</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.avoidHighways}
            onChange={(e) => update({ avoidHighways: e.target.checked })}
            disabled={disabled}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 
                       focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">Avoid highways</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.oneWayTrip ?? false}
            onChange={(e) => update({ oneWayTrip: e.target.checked })}
            disabled={disabled}
            className="w-4 h-4 rounded border-gray-300 text-primary-600 
                       focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">One-way trip (don't return home)</span>
        </label>
      </div>

      {/* Fuel cost estimation */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          ⛽ Fuel Cost Estimation
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Price per litre
            </label>
            <input
              type="number"
              value={settings.fuelPricePerLiter ?? 1.8}
              onChange={(e) => update({ fuelPricePerLiter: Number(e.target.value) })}
              min={0.1}
              max={10}
              step={0.05}
              disabled={disabled}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg 
                         focus:outline-none focus:ring-2 focus:ring-primary-500 
                         disabled:bg-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              L/100 km
            </label>
            <input
              type="number"
              value={settings.fuelEfficiencyLPer100km ?? 8.0}
              onChange={(e) => update({ fuelEfficiencyLPer100km: Number(e.target.value) })}
              min={1}
              max={30}
              step={0.5}
              disabled={disabled}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg 
                         focus:outline-none focus:ring-2 focus:ring-primary-500 
                         disabled:bg-gray-100"
            />
          </div>
        </div>
      </div>

      {/* Traffic-aware routing */}
      <div className="flex items-center justify-between py-2">
        <div>
          <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
            Traffic-aware ETAs
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Google Maps only · future dates · Drive API billing
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.useTrafficData ?? true}
          onClick={() => update({ useTrafficData: !(settings.useTrafficData ?? true) })}
          disabled={disabled}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 ${
            (settings.useTrafficData ?? true) ? 'bg-primary-600' : 'bg-gray-200'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              (settings.useTrafficData ?? true) ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
