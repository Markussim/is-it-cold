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
  const {
    lowTempThreshold: lowTempThreshold,
    highTempThreshold: highTempThreshold,
    lowDewPointThreshold: lowDewPointThreshold,
    highDewPointThreshold: highDewPointThreshold,
    rainThreshold,
  } = getExtremeThresholds(highLowDays, 20);
  const todayKey = unixToDate(now.getTime());
  const todayTemps = highLowDays.get(todayKey);

  if (!todayTemps) {
    console.warn('No temperature data for today.');
    return;
  }

  let msg: string | null = null;
  const { tempHigh, tempLow, highTempDate, lowTempDate, dewPointHighDate, dewPointLowDate } =
    todayTemps;
  const nowDate = Date.now();

  console.info({
    highTempThreshold,
    lowTempThreshold,
    highDewPointThreshold,
    lowDewPointThreshold,
    rainThreshold,
  });

  console.info({
    lowTemp: tempLow,
    highTemp: tempHigh,
    rain: Number(todayTemps.rainAmount.toFixed(2)),
    dewPointHigh: todayTemps.dewPointHigh,
    dewPointLow: todayTemps.dewPointLow,
  });

  // Compose message
  if (tempHigh > highTempThreshold && tempLow < lowTempThreshold) {
    msg = messages.notifications.sv.current.both;
  } else if (tempHigh > highTempThreshold) {
    msg =
      highTempDate && nowDate > highTempDate
        ? messages.notifications.sv.past.hot
        : messages.notifications.sv.current.hot;
  } else if (tempLow < lowTempThreshold) {
    msg =
      lowTempDate && nowDate > lowTempDate
        ? messages.notifications.sv.past.cold
        : messages.notifications.sv.current.cold;
  }

  if (
    todayTemps.dewPointHigh > highDewPointThreshold &&
    todayTemps.dewPointLow < lowDewPointThreshold
  ) {
    if (msg) {
      msg += '\n';
    } else {
      msg = '';
    }
    msg += messages.notifications.sv.current.humidityBoth;
  } else if (todayTemps.dewPointHigh > highDewPointThreshold) {
    if (msg) {
      msg += '\n';
    } else {
      msg = '';
    }
    msg += messages.notifications.sv.current.humid;
  } else if (todayTemps.dewPointLow < lowDewPointThreshold) {
    if (msg) {
      msg += '\n';
    } else {
      msg = '';
    }
    msg += messages.notifications.sv.current.dry;
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
    .replace('TEMPERATURE_LOW', String(tempLow))
    .replace('TEMPERATURE_HIGH', String(tempHigh))
    .replace('TEMPERATURE_LOW_TIME', unixTimeToTimeOfDay(lowTempDate))
    .replace('TEMPERATURE_HIGH_TIME', unixTimeToTimeOfDay(highTempDate))
    .replace('RAIN_AMOUNT', todayTemps.rainAmount.toFixed(1))
    .replace('DEWPOINT_HIGH', String(todayTemps.dewPointHigh))
    .replace('DEWPOINT_LOW', String(todayTemps.dewPointLow))
    .replace('DEWPOINT_HIGH_TIME', unixTimeToTimeOfDay(dewPointHighDate))
    .replace('DEWPOINT_LOW_TIME', unixTimeToTimeOfDay(dewPointLowDate));
  msg = TAG_ID + '\n' + msg;

  await axios.post(DISCORD_WEBHOOK, { content: msg });
  console.log('Notification to Discord:', msg);
}
