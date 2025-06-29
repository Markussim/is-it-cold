import { DayWeather } from '../models';

export function unixToDate(unixtime: number): string {
  const date = new Date(unixtime);
  return date.toISOString().slice(0, 10);
}

export function unixTimeToTimeOfDay(unixtime: number | undefined): string {
  if (!unixtime) return '';
  const date = new Date(unixtime);
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Stockholm',
  });
}

export function isoDateToUnix(isoString: string): number {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid ISO date string');
  }
  return date.getTime();
}

export function getExtremeThresholds(
  tempMap: Map<string, DayWeather>,
  percentile: number,
): {
  lowTempThreshold: number;
  highTempThreshold: number;
  lowDewPointThreshold: number;
  highDewPointThreshold: number;
  rainThreshold: number;
} {
  const tempLows = Array.from(tempMap.values())
    .map((day) => day.tempLow)
    .filter(Boolean);
  const tempHighs = Array.from(tempMap.values())
    .map((day) => day.tempHigh)
    .filter(Boolean);

  const dewPointLows = Array.from(tempMap.values())
    .map((day) => day.dewPointLow)
    .filter(Boolean);
  const dewPointHighs = Array.from(tempMap.values())
    .map((day) => day.dewPointHigh)
    .filter(Boolean);

  const rains = Array.from(tempMap.values())
    .map((day) => day.rainAmount)
    .filter(Boolean);

  tempLows.sort((a, b) => a - b);
  tempHighs.sort((a, b) => a - b);
  rains.sort((a, b) => a - b);

  const lowTempIndex = Math.min(
    Math.floor((tempLows.length * percentile) / 100),
    tempLows.length - 1,
  );
  const highTempIndex = Math.max(Math.floor(tempHighs.length * (1 - percentile / 100)), 0);

  const lowDewPointIndex = Math.min(
    Math.floor((dewPointLows.length * percentile) / 100),
    dewPointLows.length - 1,
  );
  const highDewPointIndex = Math.max(Math.floor(dewPointHighs.length * (1 - percentile / 100)), 0);

  const rainIndex = Math.max(Math.floor(rains.length * (1 - (percentile * 2) / 100)), 0);

  return {
    lowTempThreshold: tempLows[lowTempIndex],
    highTempThreshold: tempHighs[highTempIndex],
    lowDewPointThreshold: dewPointLows[lowDewPointIndex],
    highDewPointThreshold: dewPointHighs[highDewPointIndex],
    rainThreshold: rains[rainIndex],
  };
}

/**
 * Calculates dew point (°C) given temperature (°C) and relative humidity (%).
 * Uses the Magnus formula, compensating for T < 0°C (over ice).
 * @param tempC - Temperature in Celsius
 * @param rh - Relative Humidity in %
 * @returns Dew point in Celsius
 */
export function dewPoint(tempC: number, rh: number): number {
  // Validate input
  if (rh <= 0 || rh > 100) throw new Error('Relative humidity out of range (0 < RH <= 100)');
  if (isNaN(tempC) || isNaN(rh)) throw new Error('Invalid temperature or humidity');

  // Magnus formula constants
  // For T >= 0°C (over water)
  const a_water = 17.62;
  const b_water = 243.12;

  // For T < 0°C (over ice)
  const a_ice = 22.46;
  const b_ice = 272.62;

  // Select constants
  const a = tempC >= 0 ? a_water : a_ice;
  const b = tempC >= 0 ? b_water : b_ice;

  // Magnus formula
  const alpha = Math.log(rh / 100) + (a * tempC) / (b + tempC);
  const dew = (b * alpha) / (a - alpha);

  return Number(dew.toFixed(1));
}
