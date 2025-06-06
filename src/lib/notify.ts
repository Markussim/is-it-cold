import axios from 'axios';
import { getExtremeThresholds, unixToDate, unixTimeToTimeOfDay } from './weatherUtils';
import { DISCORD_WEBHOOK } from '../config/env';
import messages from '../messages.json';
import { DayWeather } from '../models';
import { TAG_ID } from '../config/env';
import console from 'console';

export async function sendNotification(
  highLowDays: Map<string, DayWeather>,
  now: Date,
): Promise<void> {
  const { lowThreshold, highThreshold, rainThreshold } = getExtremeThresholds(highLowDays, 20);
  const todayKey = unixToDate(now.getTime());
  const todayTemps = highLowDays.get(todayKey);

  if (!todayTemps) {
    console.warn('No temperature data for today.');
    return;
  }

  let msg: string | null = null;
  const { tempHigh: high, tempLow: low, highDate, lowDate } = todayTemps;
  const nowDate = Date.now();

  console.info({
    lowThreshold: lowThreshold,
    highThreshold: highThreshold,
    rainThreshold: rainThreshold,
  });

  console.info({
    low: low,
    high: high,
    rain: Number(todayTemps.rainAmount.toFixed(2)),
  });

  // Compose message
  if (high > highThreshold && low < lowThreshold) {
    msg = messages.notifications.sv.current.both;
  } else if (high > highThreshold) {
    msg =
      highDate && nowDate > highDate
        ? messages.notifications.sv.past.hot
        : messages.notifications.sv.current.hot;
  } else if (low < lowThreshold) {
    msg =
      lowDate && nowDate > lowDate
        ? messages.notifications.sv.past.cold
        : messages.notifications.sv.current.cold;
  }
  if (todayTemps.rainAmount > rainThreshold) {
    if (msg) {
      msg += '\n';
    } else {
      msg = '';
    }
    msg += messages.notifications.sv.current.rain;
  }

  if (!msg) return;

  msg = msg
    .replace('TEMPERATURE_LOW', String(low))
    .replace('TEMPERATURE_HIGH', String(high))
    .replace('TEMPERATURE_LOW_TIME', unixTimeToTimeOfDay(lowDate))
    .replace('TEMPERATURE_HIGH_TIME', unixTimeToTimeOfDay(highDate))
    .replace('RAIN_AMOUNT', todayTemps.rainAmount.toFixed(1));
  msg = TAG_ID + '\n' + msg;

  await axios.post(DISCORD_WEBHOOK, { content: msg });
  console.log('Notification to Discord:', msg);
}
