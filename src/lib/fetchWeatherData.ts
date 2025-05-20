import axios from 'axios';
import { STATION_URL, PREDICTION_URL } from '../config/env';
import { unixToDate, isoDateToUnix } from './temperatureUtils';
import { DayTemperature, Temperature } from '../models';

export async function getFourWeeksHighLow(): Promise<{
  highLowDays: Map<string, DayTemperature>;
  now: Date;
}> {
  const now = new Date();
  const fourWeeksAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28);

  const [stationRes, predictionRes] = await Promise.all([
    axios.get(STATION_URL),
    axios.get(PREDICTION_URL),
  ]);

  // Extract historical
  const tempArray: Temperature[] = Array.isArray(stationRes.data.value)
    ? stationRes.data.value.map((obj: any) => ({
        date: obj.date,
        temp: obj.value,
      }))
    : [];

  // Add predictions
  const tomorrowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();

  for (const timeEntry of predictionRes.data.timeSeries) {
    const dateMs = isoDateToUnix(timeEntry.validTime);
    if (dateMs > tomorrowMidnight) continue;
    const tParam = timeEntry.parameters.find((p: any) => p.name === 't');
    if (!tParam) continue;
    const temp = Number(tParam.values[0]);
    let temperature: Temperature = { date: dateMs, temp: temp };
    tempArray.push(temperature);
  }

  // Aggregate by day
  const highLowDays = new Map<string, DayTemperature>();
  for (const entry of tempArray) {
    if (entry.date < fourWeeksAgo.getTime()) continue;
    const dateKey = unixToDate(entry.date);

    // SAFETY: filter out unexpected values
    const tempVal = Number(entry.temp);
    if (!isFinite(tempVal)) continue; // Skip NaNs, Infinity, etc.

    let current = highLowDays.get(dateKey);
    if (!current) {
      current = {
        high: tempVal,
        highDate: entry.date,
        low: tempVal,
        lowDate: entry.date,
      };
    } else {
      // Make sure the current values are numbers!
      current.high = Number(current.high);
      current.low = Number(current.low);

      if (tempVal > current.high) {
        current.high = tempVal;
        current.highDate = entry.date;
      }
      if (tempVal < current.low) {
        current.low = tempVal;
        current.lowDate = entry.date;
      }
      // SAFEGUARD: Just in case, enforce invariant
      if (current.low > current.high) {
        throw new Error('Inconsistent temperature data');
      }
    }
    highLowDays.set(dateKey, current);
  }

  return { highLowDays, now };
}
