import { EVProfile, EVStopInfo, EVConnectorType, Place, PlaceType } from './types';

export interface EVCarPreset {
  id: string;
  name: string;
  batteryCapacityKWh: number;
  consumptionWhPerKm: number;
  maxChargingPowerKW: number;
  preferredConnectors: EVConnectorType[];
}

export const EV_PRESETS: EVCarPreset[] = [
  {
    id: 'tesla_m3_lr',
    name: 'Tesla Model 3 Long Range',
    batteryCapacityKWh: 75,
    consumptionWhPerKm: 155,
    maxChargingPowerKW: 250,
    preferredConnectors: ['CCS2', 'Tesla_Supercharger', 'Tesla_NACS'],
  },
  {
    id: 'tesla_my_lr',
    name: 'Tesla Model Y Long Range',
    batteryCapacityKWh: 75,
    consumptionWhPerKm: 172,
    maxChargingPowerKW: 250,
    preferredConnectors: ['CCS2', 'Tesla_Supercharger', 'Tesla_NACS'],
  },
  {
    id: 'vw_id4',
    name: 'Volkswagen ID.4 Pro',
    batteryCapacityKWh: 77,
    consumptionWhPerKm: 185,
    maxChargingPowerKW: 135,
    preferredConnectors: ['CCS2', 'Type2'],
  },
  {
    id: 'hyundai_ioniq5',
    name: 'Hyundai Ioniq 5 / Kia EV6 77kWh',
    batteryCapacityKWh: 77.4,
    consumptionWhPerKm: 180,
    maxChargingPowerKW: 235,
    preferredConnectors: ['CCS2', 'Type2'],
  },
  {
    id: 'bmw_i4',
    name: 'BMW i4 eDrive40',
    batteryCapacityKWh: 80.7,
    consumptionWhPerKm: 170,
    maxChargingPowerKW: 205,
    preferredConnectors: ['CCS2', 'Type2'],
  },
  {
    id: 'custom',
    name: 'Custom Electric Vehicle',
    batteryCapacityKWh: 70,
    consumptionWhPerKm: 180,
    maxChargingPowerKW: 150,
    preferredConnectors: ['CCS2', 'Type2'],
  },
];

export const DEFAULT_EV_PROFILE: EVProfile = {
  enabled: false,
  batteryCapacityKWh: 77,
  currentChargePercent: 90,
  consumptionWhPerKm: 175,
  maxChargingPowerKW: 170,
  targetChargePercent: 80,
  minArrivalChargePercent: 15,
  preferredConnectorTypes: ['CCS2', 'Type2'],
  kwhPrice: 0.45,
};

/**
 * Calculates estimated charging duration (in minutes) with non-linear battery curve tapering.
 * Fast charging slows down significantly past 80% to protect the lithium battery.
 */
export function calculateChargingDurationMinutes(
  batteryCapacityKWh: number,
  startPercent: number,
  targetPercent: number,
  vehicleMaxPowerKW: number,
  stationMaxPowerKW: number = 150
): { durationMinutes: number; energyAddedKWh: number } {
  if (targetPercent <= startPercent) {
    return { durationMinutes: 0, energyAddedKWh: 0 };
  }

  const effectiveMaxPower = Math.min(vehicleMaxPowerKW, stationMaxPowerKW);
  const totalChargePercentNeeded = targetPercent - startPercent;
  const energyAddedKWh = (totalChargePercentNeeded / 100) * batteryCapacityKWh;

  // Split into phases: 0-50% (full power), 50-80% (80% speed), 80-100% (35% speed)
  let totalHours = 0;

  // Segment 1: startPercent up to min(targetPercent, 50)
  if (startPercent < 50 && targetPercent > startPercent) {
    const segEnd = Math.min(targetPercent, 50);
    const segKWh = ((segEnd - startPercent) / 100) * batteryCapacityKWh;
    totalHours += segKWh / (effectiveMaxPower * 0.95);
  }

  // Segment 2: max(startPercent, 50) up to min(targetPercent, 80)
  if (startPercent < 80 && targetPercent > 50) {
    const segStart = Math.max(startPercent, 50);
    const segEnd = Math.min(targetPercent, 80);
    if (segEnd > segStart) {
      const segKWh = ((segEnd - segStart) / 100) * batteryCapacityKWh;
      totalHours += segKWh / (effectiveMaxPower * 0.78);
    }
  }

  // Segment 3: max(startPercent, 80) up to targetPercent
  if (targetPercent > 80) {
    const segStart = Math.max(startPercent, 80);
    const segKWh = ((targetPercent - segStart) / 100) * batteryCapacityKWh;
    totalHours += segKWh / (effectiveMaxPower * 0.35);
  }

  // 5 minute handling buffer (pulling up, plugging in, app authorization)
  const durationMinutes = Math.max(10, Math.round(totalHours * 60) + 5);

  return {
    durationMinutes,
    energyAddedKWh: Math.round(energyAddedKWh * 10) / 10,
  };
}

/**
 * Computes the maximum safe highway driving range in kilometers with a given profile.
 */
export function calculateEVRangeKm(profile: EVProfile): {
  singleChargeRangeKm: number;
  usableDailyRangeKm: number;
} {
  const { batteryCapacityKWh, currentChargePercent, consumptionWhPerKm, minArrivalChargePercent, targetChargePercent } = profile;
  
  // From current charge down to minimum buffer
  const usableKWhCurrent = Math.max(0, ((currentChargePercent - minArrivalChargePercent) / 100) * batteryCapacityKWh);
  const singleChargeRangeKm = Math.round((usableKWhCurrent * 1000) / consumptionWhPerKm);

  // Typical full daily cycle: from target (80%) down to min buffer (15%) = 65% usable
  const usableKWhCycle = Math.max(0, ((targetChargePercent - minArrivalChargePercent) / 100) * batteryCapacityKWh);
  const usableDailyRangeKm = Math.round((usableKWhCycle * 1000) / consumptionWhPerKm);

  return { singleChargeRangeKm, usableDailyRangeKm };
}

/**
 * Enriches an EV charging station with realistic network, connector, live availability,
 * and pricing data if missing.
 */
export function enrichEVStationDetails(station: Place, preferredConnectors: EVConnectorType[] = ['CCS2']): Place {
  if (station.evDetails?.maxPowerKW && station.evDetails.connectors) {
    return station;
  }

  const nameUpper = station.name.toUpperCase();
  let network = 'Independent Fast Charger';
  let maxPowerKW = 150;
  let connectors: string[] = preferredConnectors && preferredConnectors.length > 0
    ? [...preferredConnectors]
    : ['CCS2', 'Type2'];
  let pricePerKWh = 0.48;

  if (nameUpper.includes('IONITY')) {
    network = 'IONITY';
    maxPowerKW = 350;
    connectors = ['CCS2'];
    pricePerKWh = 0.69;
  } else if (nameUpper.includes('TESLA') || nameUpper.includes('SUPERCHARGER')) {
    network = 'Tesla Supercharger';
    maxPowerKW = 250;
    connectors = ['Tesla_Supercharger', 'CCS2', 'Tesla_NACS'];
    pricePerKWh = 0.42;
  } else if (nameUpper.includes('FASTNED')) {
    network = 'Fastned';
    maxPowerKW = 300;
    connectors = ['CCS2', 'CHAdeMO'];
    pricePerKWh = 0.59;
  } else if (nameUpper.includes('ENBW')) {
    network = 'EnBW HyperNetz';
    maxPowerKW = 300;
    connectors = ['CCS2', 'Type2'];
    pricePerKWh = 0.51;
  } else if (nameUpper.includes('ELECTRIFY')) {
    network = 'Electrify America';
    maxPowerKW = 350;
    connectors = ['CCS1', 'CHAdeMO'];
    pricePerKWh = 0.48;
  } else if (nameUpper.includes('ALLEGO')) {
    network = 'Allego';
    maxPowerKW = 175;
    connectors = ['CCS2', 'CHAdeMO'];
    pricePerKWh = 0.55;
  } else if (nameUpper.includes('TOTAL') || nameUpper.includes('SHELL') || nameUpper.includes('BP PULSE')) {
    network = 'Oil & Gas Ultra-Fast';
    maxPowerKW = 150;
    connectors = ['CCS2', 'Type2'];
    pricePerKWh = 0.52;
  }

  // Consistent pseudo-random availability derived from name string
  const hash = station.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const totalStalls = (hash % 6) + 4; // 4 to 9 stalls
  const availableStalls = Math.max(1, hash % totalStalls);

  return {
    ...station,
    evDetails: {
      network,
      maxPowerKW,
      connectors,
      totalStalls,
      availableStalls,
      pricePerKWh,
      isFastCharger: maxPowerKW >= 50,
    },
  };
}

/**
 * Evaluates EV charging requirements for a day's driving and generates detailed stop recommendations.
 */
export function planDayEVStops(
  dayDistanceKm: number,
  candidateStations: Place[],
  profile: EVProfile,
  dayStartBatteryPercent: number = profile.currentChargePercent
): {
  evStopsDetailed: EVStopInfo[];
  dayEndBatteryPercent: number;
  totalChargingMinutes: number;
  totalChargingCost: number;
} {
  const { batteryCapacityKWh, consumptionWhPerKm, maxChargingPowerKW, targetChargePercent, minArrivalChargePercent, kwhPrice = 0.45 } = profile;

  // Energy consumed across the entire day in kWh
  const totalEnergyNeededKWh = (dayDistanceKm * consumptionWhPerKm) / 1000;
  const batteryPctUsed = (totalEnergyNeededKWh / batteryCapacityKWh) * 100;

  // Check if we can complete the day without any charging stop
  const projectedArrivalPct = Math.round(dayStartBatteryPercent - batteryPctUsed);
  if (projectedArrivalPct >= minArrivalChargePercent) {
    return {
      evStopsDetailed: [],
      dayEndBatteryPercent: projectedArrivalPct,
      totalChargingMinutes: 0,
      totalChargingCost: 0,
    };
  }

  // We need one or more charging stops!
  // Single-charge range from dayStartBatteryPercent to minArrivalChargePercent
  const usableKWh = Math.max(0, ((dayStartBatteryPercent - minArrivalChargePercent) / 100) * batteryCapacityKWh);
  const singleRangeKm = (usableKWh * 1000) / consumptionWhPerKm;

  // Determine how many stops are required
  const deficitKm = dayDistanceKm - singleRangeKm;
  const cycleRangeKm = (((targetChargePercent - minArrivalChargePercent) / 100) * batteryCapacityKWh * 1000) / consumptionWhPerKm;
  const stopsCount = Math.max(1, Math.ceil(deficitKm / Math.max(50, cycleRangeKm)));

  const evStopsDetailed: EVStopInfo[] = [];
  let totalChargingMinutes = 0;
  let totalChargingCost = 0;

  const enrichedStations = candidateStations.map((s) => enrichEVStationDetails(s, profile.preferredConnectorTypes));

  for (let i = 0; i < stopsCount; i++) {
    // Select station from candidates (or synthesize one if none found nearby)
    const station = enrichedStations[i % Math.max(1, enrichedStations.length)] || {
      id: `ev-station-synth-${i}`,
      name: `High-Power EV Hub (Auto-planned)`,
      address: `Highway Charging Corridor`,
      location: { lat: 0, lng: 0 },
      type: PlaceType.EV_CHARGING,
      rating: 4.6,
      evDetails: {
        network: 'Fast Charging Corridor',
        maxPowerKW: 150,
        connectors: ['CCS2', 'Type2'],
        totalStalls: 8,
        availableStalls: 4,
        pricePerKWh: kwhPrice,
        isFastCharger: true,
      },
    };

    const arrivalSoC = Math.max(10, minArrivalChargePercent + 5);
    const stationPower = station.evDetails?.maxPowerKW || 150;
    const { durationMinutes, energyAddedKWh } = calculateChargingDurationMinutes(
      batteryCapacityKWh,
      arrivalSoC,
      targetChargePercent,
      maxChargingPowerKW,
      stationPower
    );

    const unitPrice = station.evDetails?.pricePerKWh || kwhPrice;
    const stopCost = Math.round(energyAddedKWh * unitPrice * 100) / 100;

    totalChargingMinutes += durationMinutes;
    totalChargingCost += stopCost;

    evStopsDetailed.push({
      place: station,
      arrivalBatteryPercent: arrivalSoC,
      departureBatteryPercent: targetChargePercent,
      energyNeededKWh: energyAddedKWh,
      chargingMinutes: durationMinutes,
      chargingCost: stopCost,
      chargerPowerKW: stationPower,
      connectorType: station.evDetails?.connectors?.[0] || 'CCS2',
      isAvailable: (station.evDetails?.availableStalls ?? 1) > 0,
    });
  }

  // End of day battery estimate after the last charge
  const remainingKmAfterLastCharge = Math.min(dayDistanceKm * 0.4, 180);
  const remainingKWhUsed = (remainingKmAfterLastCharge * consumptionWhPerKm) / 1000;
  const dayEndBatteryPercent = Math.max(15, Math.round(targetChargePercent - (remainingKWhUsed / batteryCapacityKWh) * 100));

  return {
    evStopsDetailed,
    dayEndBatteryPercent,
    totalChargingMinutes,
    totalChargingCost: Math.round(totalChargingCost * 100) / 100,
  };
}
