import console from 'console';
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
): { lowThreshold: number; highThreshold: number; rainThreshold: number } {
  const lows = Array.from(tempMap.values())
    .map((day) => day.tempLow)
    .filter(Boolean);
  const highs = Array.from(tempMap.values())
    .map((day) => day.tempHigh)
    .filter(Boolean);

  const rains = Array.from(tempMap.values())
    .map((day) => day.rainAmount)
    .filter(Boolean);

  lows.sort((a, b) => a - b);
  highs.sort((a, b) => a - b);
  rains.sort((a, b) => a - b);

  const lowIndex = Math.min(Math.floor((lows.length * percentile) / 100), lows.length - 1);
  const highIndex = Math.max(Math.floor(highs.length * (1 - percentile / 100)), 0);

  const rainIndex = Math.max(Math.floor(rains.length * (1 - (percentile * 2) / 100)), 0);

  return {
    lowThreshold: lows[lowIndex],
    highThreshold: highs[highIndex],
    rainThreshold: rains[rainIndex],
  };
}
