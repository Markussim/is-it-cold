import axios from 'axios';
import {
  STATION_URL_TEMP,
  STATION_URL_RAIN,
  PREDICTION_URL,
  STATION_URL_HUMIDITY,
  STATION_URL_WIND,
} from '../config/env';
import { unixToDate, isoDateToUnix, dewPoint } from './weatherUtils';
import { DayWeather, Weather } from '../models';

export async function getFourWeeksHighLow(): Promise<{
  highLowDays: Map<string, DayWeather>;
  now: Date;
  weatherArray: Weather[];
}> {
  const now = new Date();
  const fourWeeksAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28);

  const [tempRes, rainRes, humidityRes, predictionRes, windRes] = await Promise.all([
    axios.get(STATION_URL_TEMP),
    axios.get(STATION_URL_RAIN),
    axios.get(STATION_URL_HUMIDITY),
    axios.get(PREDICTION_URL),
    axios.get(STATION_URL_WIND),
  ]);

  // Extract temperature
  const weatherArray: Weather[] = Array.isArray(tempRes.data.value)
    ? tempRes.data.value.map((obj: any) => ({
        date: obj.date,
        temp: Number(obj.value),
        rain: 0,
        windSpeed: 0,
      }))
    : [];

  // Add rain
  // Build a map for fast lookups by timestamp
  const weatherMap = new Map<number, Weather>();
  for (const w of weatherArray) {
    weatherMap.set(w.date, w);
  }

  // Add rain (fast lookup)
  for (const entry of rainRes.data.value) {
    const tempEntry = weatherMap.get(entry.date);
    if (!tempEntry) continue;
    tempEntry.rain = Number(entry.value);
  }

  // Build humidity map for fast lookup
  const humidityMap = new Map<number, any>();
  for (const h of humidityRes.data.value) {
    humidityMap.set(h.date, h);
  }

  // Add dew point using the humidity map
  for (const entry of tempRes.data.value) {
    const tempEntry = weatherMap.get(entry.date);
    if (!tempEntry) continue;
    const humidityEntry = humidityMap.get(entry.date);
    if (!humidityEntry) continue;
    const dewPointTemp = dewPoint(Number(entry.value), Number(humidityEntry.value));
    tempEntry.dewPoint = dewPointTemp;
    tempEntry.relativeHumidity = Number(humidityEntry.value);
  }

  // Add wind speed (single pass)
  for (const entry of windRes.data.value) {
    const tempEntry = weatherMap.get(entry.date);
    if (!tempEntry) continue;
    tempEntry.windSpeed = Number(entry.value);
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
    const humidityParam = timeEntry.parameters.find((p: any) => p.name === 'r');
    const wsParam = timeEntry.parameters.find((p: any) => p.name === 'ws');
    const temp = Number(tParam.values[0]);
    const rain = Number(pmedianParam.values[0]);
    const dewPointTemp = dewPoint(temp, Number(humidityParam.values[0]));
    let temperature: Weather = {
      date: dateMs,
      temp: temp,
      rain: rain,
      windSpeed: wsParam ? Number(wsParam.values[0]) : 0,
      dewPoint: dewPointTemp,
      relativeHumidity: Number(humidityParam.values[0]),
    };
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
        windSpeedHigh: entry.windSpeed,
        windSpeedHighDate: entry.date,
        tempHigh: tempVal,
        highTempDate: entry.date,
        tempLow: tempVal,
        lowTempDate: entry.date,
        rainAmount: entry.rain,
        dewPointHigh: entry.dewPoint,
        dewPointLow: entry.dewPoint,
        dewPointHighDate: entry.date,
        dewPointLowDate: entry.date,
      };
    } else {
      // Make sure the current values are numbers!
      current.tempHigh = Number(current.tempHigh);
      current.tempLow = Number(current.tempLow);
      current.dewPointHigh = Number(current.dewPointHigh);
      current.dewPointLow = Number(current.dewPointLow);

      if (tempVal > current.tempHigh) {
        current.tempHigh = tempVal;
        current.highTempDate = entry.date;
      }
      if (tempVal < current.tempLow) {
        current.tempLow = tempVal;
        current.lowTempDate = entry.date;
      }

      if (entry.windSpeed > current.windSpeedHigh) {
        current.windSpeedHigh = entry.windSpeed;
        current.windSpeedHighDate = entry.date;
      }

      if (entry.dewPoint > current.dewPointHigh) {
        current.dewPointHigh = entry.dewPoint;
        current.dewPointHighDate = entry.date;
      }
      if (entry.dewPoint < current.dewPointLow) {
        current.dewPointLow = entry.dewPoint;
        current.dewPointLowDate = entry.date;
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

  return { highLowDays, now, weatherArray };
}
