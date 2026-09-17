'use client';

import { useState } from 'react';

import { TripSettings, EVProfile, EVConnectorType } from '@/lib/types';
import { EV_PRESETS, DEFAULT_EV_PROFILE, calculateEVRangeKm } from '@/lib/evPlanner';
import { MapProviderChoice } from './MapProviderPicker';

interface TripSettingsProps {
  settings: TripSettings;
  onChange: (settings: TripSettings) => void;
  disabled?: boolean;
  currentMapProvider?: MapProviderChoice;
  onChangeMapProvider?: () => void;
  startLocationName?: string;
}

const COUNTRY_MAP: Record<string, string> = {
  germany: 'de',
  france: 'fr',
  spain: 'es',
  netherlands: 'nl',
  austria: 'at',
  italy: 'it',
  greece: 'gr',
  croatia: 'hr',
  portugal: 'pt',
  'united kingdom': 'uk',
  belgium: 'be',
  luxembourg: 'lu',
};

export default function TripSettingsPanel({
  settings,
  onChange,
  disabled = false,
  currentMapProvider,
  onChangeMapProvider,
  startLocationName,
}: TripSettingsProps) {
  const [isFetchingFuel, setIsFetchingFuel] = useState(false);
  const evProfile: EVProfile = settings.evProfile ?? DEFAULT_EV_PROFILE;

  const update = (partial: Partial<TripSettings>) => {
    onChange({ ...settings, ...partial });
  };

  const updateEV = (partial: Partial<EVProfile>) => {
    update({ evProfile: { ...evProfile, ...partial } });
  };

  const { singleChargeRangeKm } = calculateEVRangeKm(evProfile);

  const handleAutoFillFuel = async () => {
    setIsFetchingFuel(true);
    try {
      const res = await fetch('/api/fuel');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Try to find the country in the start location string
      const locStr = (startLocationName || '').toLowerCase();
      let matchedCode = 'de'; // default to Germany if no match

      for (const [countryName, code] of Object.entries(COUNTRY_MAP)) {
        if (locStr.includes(countryName)) {
          matchedCode = code;
          break;
        }
      }

      const countryData = data.data[matchedCode];
      if (countryData) {
        update({ fuelPricePerLiter: countryData.euro95 });
        alert(`Detected ${matchedCode.toUpperCase()} prices. Updated Euro95 to €${countryData.euro95}`);
      } else {
        alert('Could not detect fuel prices for your region.');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to fetch real-time fuel prices.');
    } finally {
      setIsFetchingFuel(false);
    }
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

        {/* Transport Mode */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            🚌 Transport Mode
          </label>
          <div className="relative">
            <select
              value={settings.transportMode ?? 'car'}
              onChange={(e) =>
                update({ transportMode: e.target.value as TripSettings['transportMode'] })
              }
              disabled={disabled}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg 
                         focus:outline-none focus:ring-2 focus:ring-primary-500 
                         disabled:bg-gray-100 appearance-none bg-white"
            >
              <option value="car">Car</option>
              <option value="pedestrian">Pedestrian</option>
              <option value="bicycle">Bicycle</option>
              <option value="scooter">Scooter</option>
              <option value="truck">Truck</option>
              <option value="bus">Bus / Transit</option>
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
          <span className="text-sm text-gray-700">One-way trip (don&apos;t return home)</span>
        </label>
      </div>

      {/* Fuel cost estimation */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          ⛽ Fuel Cost Estimation
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600">
                Price per litre
              </label>
              <button
                type="button"
                onClick={handleAutoFillFuel}
                disabled={disabled || isFetchingFuel}
                className="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-0.5 rounded font-medium disabled:opacity-50 transition-colors"
              >
                {isFetchingFuel ? 'Fetching...' : 'Auto-fill'}
              </button>
            </div>
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
          <p id="traffic-aware-label" className="text-xs font-medium text-gray-600 dark:text-gray-300">
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
          aria-labelledby="traffic-aware-label"
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

      {/* Electric Vehicle (EV) Mode */}
      <div className="border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚡</span>
            <div>
              <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wide">
                Electric Vehicle (EV) Mode
              </h4>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                Auto-plan charging stops, consumption & battery levels
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={evProfile.enabled}
            onClick={() => updateEV({ enabled: !evProfile.enabled })}
            disabled={disabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 ${
              evProfile.enabled ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                evProfile.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {evProfile.enabled && (
          <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/40 space-y-3">
            {/* Vehicle Preset */}
            <div>
              <label className="block text-[11px] font-semibold text-emerald-900 dark:text-emerald-200 mb-1">
                Vehicle Model Preset
              </label>
              <select
                onChange={(e) => {
                  const preset = EV_PRESETS.find((p) => p.id === e.target.value);
                  if (preset) {
                    updateEV({
                      batteryCapacityKWh: preset.batteryCapacityKWh,
                      consumptionWhPerKm: preset.consumptionWhPerKm,
                      maxChargingPowerKW: preset.maxChargingPowerKW,
                      preferredConnectorTypes: preset.preferredConnectors,
                    });
                  }
                }}
                disabled={disabled}
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 rounded-lg text-gray-800 dark:text-gray-100"
              >
                {EV_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.batteryCapacityKWh} kWh)
                  </option>
                ))}
              </select>
            </div>

            {/* Range pill */}
            <div className="flex items-center justify-between bg-emerald-100/70 dark:bg-emerald-900/40 px-3 py-1.5 rounded-lg text-xs text-emerald-800 dark:text-emerald-200 font-medium">
              <span>Estimated Safe Range:</span>
              <span className="font-bold text-emerald-950 dark:text-emerald-100">~{singleChargeRangeKm} km</span>
            </div>

            {/* Battery Specs Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                  Battery Pack (kWh)
                </label>
                <input
                  type="number"
                  value={evProfile.batteryCapacityKWh}
                  onChange={(e) => updateEV({ batteryCapacityKWh: Number(e.target.value) })}
                  min={20}
                  max={200}
                  step={1}
                  disabled={disabled}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                  Current Charge (%)
                </label>
                <input
                  type="number"
                  value={evProfile.currentChargePercent}
                  onChange={(e) => updateEV({ currentChargePercent: Number(e.target.value) })}
                  min={10}
                  max={100}
                  step={5}
                  disabled={disabled}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                  Consumption (Wh/km)
                </label>
                <input
                  type="number"
                  value={evProfile.consumptionWhPerKm}
                  onChange={(e) => updateEV({ consumptionWhPerKm: Number(e.target.value) })}
                  min={100}
                  max={350}
                  step={5}
                  disabled={disabled}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                  Max Charge Power (kW)
                </label>
                <input
                  type="number"
                  value={evProfile.maxChargingPowerKW}
                  onChange={(e) => updateEV({ maxChargingPowerKW: Number(e.target.value) })}
                  min={20}
                  max={350}
                  step={10}
                  disabled={disabled}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                  Target Charge (%)
                </label>
                <input
                  type="number"
                  value={evProfile.targetChargePercent}
                  onChange={(e) => updateEV({ targetChargePercent: Number(e.target.value) })}
                  min={50}
                  max={100}
                  step={5}
                  disabled={disabled}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                  Min Buffer SoC (%)
                </label>
                <input
                  type="number"
                  value={evProfile.minArrivalChargePercent}
                  onChange={(e) => updateEV({ minArrivalChargePercent: Number(e.target.value) })}
                  min={5}
                  max={30}
                  step={5}
                  disabled={disabled}
                  className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
                />
              </div>
            </div>

            {/* Connectors & kWh Price */}
            <div>
              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                Preferred Connector Types
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(['CCS2', 'Type2', 'Tesla_Supercharger', 'Tesla_NACS', 'CHAdeMO'] as EVConnectorType[]).map((conn) => {
                  const isSelected = (evProfile.preferredConnectorTypes || []).includes(conn);
                  return (
                    <button
                      key={conn}
                      type="button"
                      onClick={() => {
                        const current = evProfile.preferredConnectorTypes || [];
                        const next = isSelected
                          ? current.filter((c) => c !== conn)
                          : [...current, conn];
                        updateEV({ preferredConnectorTypes: next });
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded font-medium border transition-colors ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {conn.replace('_', ' ')}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-0.5">
                Fast Charging Price (€/kWh)
              </label>
              <input
                type="number"
                value={evProfile.kwhPrice ?? 0.45}
                onChange={(e) => updateEV({ kwhPrice: Number(e.target.value) })}
                min={0.1}
                max={2.0}
                step={0.05}
                disabled={disabled}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-white"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
