import axios from 'axios';
import { getExtremeThresholds, unixToDate, unixTimeToTimeOfDay } from './temperatureUtils';
import { DISCORD_WEBHOOK } from '../config/env';
import messages from '../messages.json';
import { DayTemperature } from '../models';
import { TAG_ID } from '../config/env';
import console from 'console';

export async function sendNotification(
  highLowDays: Map<string, DayTemperature>,
  now: Date,
): Promise<void> {
  const { lowThreshold, highThreshold } = getExtremeThresholds(highLowDays, 20);
  const todayKey = unixToDate(now.getTime());
  const todayTemps = highLowDays.get(todayKey);

  if (!todayTemps) {
    console.warn('No temperature data for today.');
    return;
  }

  let msg: string | null = null;
  const { high, low, highDate, lowDate } = todayTemps;
  const nowDate = Date.now();

  // Compose message
  if (high > highThreshold && low < lowThreshold) {
    msg = messages.temperatureNotifications.sv.both;
  } else if (high > highThreshold) {
    msg =
      highDate && nowDate > highDate
        ? messages.temperatureNotifications.svPast.hot
        : messages.temperatureNotifications.sv.hot;
  } else if (low < lowThreshold) {
    msg =
      lowDate && nowDate > lowDate
        ? messages.temperatureNotifications.svPast.cold
        : messages.temperatureNotifications.sv.cold;
  }
  if (!msg) return;

  msg = msg
    .replace('TEMPERATURE_LOW', String(low))
    .replace('TEMPERATURE_HIGH', String(high))
    .replace('TEMPERATURE_LOW_TIME', unixTimeToTimeOfDay(lowDate))
    .replace('TEMPERATURE_HIGH_TIME', unixTimeToTimeOfDay(highDate));
  msg = TAG_ID + ' ' + msg;

  await axios.post(DISCORD_WEBHOOK, { content: msg });
  console.log('Notification to Discord:', msg);
}
