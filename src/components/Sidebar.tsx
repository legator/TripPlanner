'use client';

import { useState, useRef } from 'react';
import { Waypoint, TripSettings, TripPlan, ActiveView } from '@/lib/types';
import WaypointList from './WaypointList';
import TripSettingsPanel from './TripSettings';
import TripPlanView from './TripPlanView';
import { exportTripToCSV, exportTripItinerary, downloadCSV } from '@/lib/tripCsvExport';
import { generateGPX, downloadGPX } from '@/lib/tripGpxExport';

interface SidebarProps {
  waypoints: Waypoint[];
  onWaypointsChange: (waypoints: Waypoint[]) => void;
  settings: TripSettings;
  onSettingsChange: (settings: TripSettings) => void;
  tripPlan: TripPlan | null;
  onPlanTrip: () => void;
  onReset: () => void;
  isPlanning: boolean;
  error: string | null;
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
  onToggleRestDay: (dayIndex: number) => void;
  onSetDayEnd: (dayIndex: number, segmentCount: number) => void;
  onAddOvernightStop: (dayIndex: number, waypoint: Waypoint) => void;
  onOptimizeRoute?: (dayIndex: number) => void;
}

export default function Sidebar({
  waypoints,
  onWaypointsChange,
  settings,
  onSettingsChange,
  tripPlan,
  onPlanTrip,
  onReset,
  isPlanning,
  error,
  selectedDay,
  onSelectDay,
  onToggleRestDay,
  onSetDayEnd,
  onAddOvernightStop,
  onOptimizeRoute,
}: SidebarProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeView: ActiveView = tripPlan ? 'plan' : 'input';

  const handleExportCSV = () => {
    if (!tripPlan) return;
    const csvContent = exportTripToCSV({ waypoints, settings, tripPlan });
    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(csvContent, `trip-plan-${timestamp}.csv`);
    setShowExportMenu(false);
  };

  const handleExportItinerary = () => {
    if (!tripPlan) return;
    const csvContent = exportTripItinerary(tripPlan);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(csvContent, `trip-itinerary-${timestamp}.csv`);
    setShowExportMenu(false);
  };

  const handleExportGPX = () => {
    if (!tripPlan) return;
    const gpxContent = generateGPX(tripPlan);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadGPX(gpxContent, `trip-route-${timestamp}.gpx`);
    setShowExportMenu(false);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      // For now, just show a simple alert that file was read
      // Full import would require parsing CSV and reconstructing trip
      alert(`Imported file: ${file.name}\n\nNote: Full trip import functionality requires manual review of your trip data.`);
    } catch (err) {
      alert('Error reading file: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const addWaypoint = (wp: Waypoint) => {
    onWaypointsChange([...waypoints, wp]);
  };

  const removeWaypoint = (id: string) => {
    onWaypointsChange(waypoints.filter((w) => w.id !== id));
  };

  const reorderWaypoints = (fromIndex: number, toIndex: number) => {
    const newWaypoints = [...waypoints];
    const [moved] = newWaypoints.splice(fromIndex, 1);
    newWaypoints.splice(toIndex, 0, moved);
    onWaypointsChange(newWaypoints);
  };

  return (
    <div className="w-[420px] h-screen bg-white border-r border-gray-200 flex flex-col shadow-lg flex-shrink-0">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-primary-600 to-primary-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
            <span className="text-xl">🚗</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Trip Planner</h1>
            <p className="text-xs text-primary-200">Plan your road trip</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
        {activeView === 'input' && (
          <>
            {/* Waypoints */}
            <WaypointList
              waypoints={waypoints}
              onAdd={addWaypoint}
              onRemove={removeWaypoint}
              onReorder={reorderWaypoints}
              disabled={isPlanning}
            />

            {/* Settings toggle */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 w-full text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Trip Settings
            </button>

            {showSettings && (
              <TripSettingsPanel
                settings={settings}
                onChange={onSettingsChange}
                disabled={isPlanning}
              />
            )}

            {/* Error message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </>
        )}

        {activeView === 'plan' && tripPlan && (
          <TripPlanView
            tripPlan={tripPlan}
            selectedDay={selectedDay}
            onSelectDay={onSelectDay}
            onReset={onReset}
            onToggleRestDay={onToggleRestDay}
            onSetDayEnd={onSetDayEnd}
            onAddOvernightStop={onAddOvernightStop}
            onOptimizeRoute={onOptimizeRoute}
            isPlanning={isPlanning}
            maxDistanceKm={settings.maxDistancePerDayKm}
            maxDrivingMinutes={settings.maxDrivingMinutesPerDay}
          />
        )}
      </div>

      {/* Footer action button */}
      {activeView === 'input' && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 space-y-2">
          <button
            onClick={onPlanTrip}
            disabled={waypoints.length < 2 || isPlanning}
            className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 
                       disabled:cursor-not-allowed text-white font-semibold rounded-xl 
                       transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            {isPlanning ? (
              <>
                <svg
                  className="spinner w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" opacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Planning your trip...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  />
                </svg>
                Plan My Trip
              </>
            )}
          </button>

          <button
            onClick={handleImportClick}
            className="w-full py-2 px-4 bg-blue-100 hover:bg-blue-200 text-blue-700 
                       font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0 0V8m0 4H8m4 0h4m6 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Import Trip (CSV)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* Export menu for plan view */}
      {activeView === 'plan' && tripPlan && (
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 space-y-2">
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="w-full py-2 px-4 bg-green-100 hover:bg-green-200 text-green-700 
                         font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export Trip
            </button>

            {showExportMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <button
                  onClick={handleExportCSV}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-gray-700 first:rounded-t-lg"
                >
                  📋 Export Full Plan (CSV)
                </button>
                <button
                  onClick={handleExportItinerary}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-gray-700"
                >
                  📅 Export Itinerary (CSV)
                </button>
                <button
                  onClick={handleExportGPX}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-gray-700 last:rounded-b-lg"
                >
                  🗺️ Export Route (GPX)
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => {
              setShowExportMenu(false);
              onReset();
            }}
            className="w-full py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 
                       font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}
