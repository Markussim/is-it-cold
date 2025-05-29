import axios from 'axios';
import { STATION_URL_TEMP, STATION_URL_RAIN, PREDICTION_URL } from '../config/env';
import { unixToDate, isoDateToUnix } from './temperatureUtils';
import { DayWeather, Weather } from '../models';

export async function getFourWeeksHighLow(): Promise<{
  highLowDays: Map<string, DayWeather>;
  now: Date;
}> {
  const now = new Date();
  const fourWeeksAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28);

  const [tempRes, rainRes, predictionRes] = await Promise.all([
    axios.get(STATION_URL_TEMP),
    axios.get(STATION_URL_RAIN),
    axios.get(PREDICTION_URL),
  ]);

  // Extract temperature
  const weatherArray: Weather[] = Array.isArray(tempRes.data.value)
    ? tempRes.data.value.map((obj: any) => ({
        date: obj.date,
        temp: Number(obj.value),
        rain: 0,
      }))
    : [];

  // Add rain
  for (const entry of rainRes.data.value) {
    // Find the matching temperature entry
    const tempEntry = weatherArray.find((w) => w.date === entry.date);
    if (!tempEntry) continue;
    tempEntry.rain = Number(entry.value);
  }

  // Add predictions
  const tomorrowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();

  for (const timeEntry of predictionRes.data.timeSeries) {
    const dateMs = isoDateToUnix(timeEntry.validTime);
    if (dateMs > tomorrowMidnight) continue;
    const tParam = timeEntry.parameters.find((p: any) => p.name === 't');
    if (!tParam) continue;
    const pmedianParam = timeEntry.parameters.find((p: any) => p.name === 'pmedian');
    if (!pmedianParam) continue;
    const temp = Number(tParam.values[0]);
    const rain = Number(pmedianParam.values[0]);
    let temperature: Weather = { date: dateMs, temp: temp, rain: rain };
    weatherArray.push(temperature);
  }

  // Aggregate by day
  const highLowDays = new Map<string, DayWeather>();
  for (const entry of weatherArray) {
    if (entry.date < fourWeeksAgo.getTime()) continue;
    const dateKey = unixToDate(entry.date);

    // SAFETY: filter out unexpected values
    const tempVal = Number(entry.temp);
    if (!isFinite(tempVal)) continue; // Skip NaNs, Infinity, etc.

    let current = highLowDays.get(dateKey);
    if (!current) {
      current = {
        tempHigh: tempVal,
        highDate: entry.date,
        tempLow: tempVal,
        lowDate: entry.date,
        rainAmount: entry.rain,
      };
    } else {
      // Make sure the current values are numbers!
      current.tempHigh = Number(current.tempHigh);
      current.tempLow = Number(current.tempLow);

      if (tempVal > current.tempHigh) {
        current.tempHigh = tempVal;
        current.highDate = entry.date;
      }
      if (tempVal < current.tempLow) {
        current.tempLow = tempVal;
        current.lowDate = entry.date;
      }

      if (current.rainAmount === undefined) {
        current.rainAmount = entry.rain;
      } else {
        current.rainAmount += entry.rain;
      }

      current.rainAmount = current.rainAmount += entry.rain;

      // SAFEGUARD: Just in case, enforce invariant
      if (current.tempLow > current.tempHigh) {
        throw new Error('Inconsistent temperature data');
      }
    }
    highLowDays.set(dateKey, current);
  }

  return { highLowDays, now };
}
