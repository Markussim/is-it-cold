import axios from 'axios';
import { getExtremeThresholds, unixToDate, unixTimeToTimeOfDay } from './weatherUtils';
import { DISCORD_WEBHOOK } from '../config/env';
import messages from '../messages.json';
import { DayWeather, Weather } from '../models';
import { TAG_ID } from '../config/env';
import console from 'console';

// 1) Define which data points can be toggled on/off,
//    and which placeholders each point controls.
type DataPoint = 'tempHigh' | 'tempLow' | 'dewPointHigh' | 'dewPointLow' | 'rain';

// Edit this array to control which datapoints are allowed in the final message:
const ENABLED_DATA_POINTS: DataPoint[] = ['tempHigh', 'tempLow', 'rain'];

// Map datapoints to the placeholders that appear in messages.json templates.
const TOKENS_BY_POINT: Record<DataPoint, string[]> = {
  tempHigh: ['TEMPERATURE_HIGH', 'TEMPERATURE_HIGH_TIME'],
  tempLow: ['TEMPERATURE_LOW', 'TEMPERATURE_LOW_TIME'],
  dewPointHigh: [
    'DEWPOINT_HIGH',
    'DEWPOINT_HIGH_TIME',
    'DEWPOINT_HIGH_TEMP',
    'DEWPOINT_HIGH_RELATIVE_HUMIDITY',
  ],
  dewPointLow: [
    'DEWPOINT_LOW',
    'DEWPOINT_LOW_TIME',
    'DEWPOINT_LOW_TEMP',
    'DEWPOINT_LOW_RELATIVE_HUMIDITY',
  ],
  rain: ['RAIN_AMOUNT'],
};

// Helper: filter out any lines that reference disabled datapoints
function filterMessageByEnabledPoints(msg: string, enabledPoints: Set<DataPoint>): string {
  const disabledTokens = Object.entries(TOKENS_BY_POINT)
    .filter(([point]) => !enabledPoints.has(point as DataPoint))
    .flatMap(([, tokens]) => tokens);

  const lines = msg.split('\n');

  // Keep a line if it does NOT contain any disabled token
  const filtered = lines.filter((line) => !disabledTokens.some((tok) => line.includes(tok)));

  return filtered
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Helper: replace tokens safely
function replaceTokens(msg: string, values: Record<string, string | undefined>): string {
  let out = msg;
  for (const [token, value] of Object.entries(values)) {
    // If value is undefined, leave the token as-is (line likely already filtered out)
    if (value !== undefined) {
      // replace all occurrences
      out = out.split(token).join(value);
    }
  }
  return out;
}

export async function sendNotification(
  highLowDays: Map<string, DayWeather>,
  now: Date,
  weatherArray: Weather[],
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

  // Compose message sections from messages.json
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

  const isDewHighPast = dewPointHighDate && nowDate > dewPointHighDate;
  const isDewLowPast = dewPointLowDate && nowDate > dewPointLowDate;

  // humidity messages
  if (
    todayTemps.dewPointHigh > highDewPointThreshold &&
    todayTemps.dewPointLow < lowDewPointThreshold
  ) {
    msg = msg ? msg + '\n' : '';
    msg += messages.notifications.sv.current.humidityBoth;
  } else if (todayTemps.dewPointHigh > highDewPointThreshold) {
    msg = msg ? msg + '\n' : '';
    msg += isDewHighPast
      ? messages.notifications.sv.past.humid
      : messages.notifications.sv.current.humid;
  } else if (todayTemps.dewPointLow < lowDewPointThreshold) {
    msg = msg ? msg + '\n' : '';
    msg += isDewLowPast
      ? messages.notifications.sv.past.dry
      : messages.notifications.sv.current.dry;
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

  // 2) Filter message lines based on enabled data points BEFORE replacements
  const enabled = new Set(ENABLED_DATA_POINTS);
  msg = filterMessageByEnabledPoints(msg, enabled);
  if (!msg) return;

  // 3) Gather values for placeholders (only enabled will be replaced)
  const dewPointHighData = weatherArray.find((w) => w.date === dewPointHighDate);
  const dewPointLowData = weatherArray.find((w) => w.date === dewPointLowDate);

  const tokenValues: Record<string, string | undefined> = {
    TEMPERATURE_LOW: String(tempLow),
    TEMPERATURE_HIGH: String(tempHigh),
    TEMPERATURE_LOW_TIME: unixTimeToTimeOfDay(lowTempDate),
    TEMPERATURE_HIGH_TIME: unixTimeToTimeOfDay(highTempDate),

    RAIN_AMOUNT: todayTemps.rainAmount.toFixed(1),

    DEWPOINT_HIGH: String(todayTemps.dewPointHigh),
    DEWPOINT_LOW: String(todayTemps.dewPointLow),
    DEWPOINT_HIGH_TIME: unixTimeToTimeOfDay(dewPointHighDate),
    DEWPOINT_LOW_TIME: unixTimeToTimeOfDay(dewPointLowDate),
    DEWPOINT_HIGH_TEMP:
      dewPointHighData?.temp !== undefined ? String(dewPointHighData.temp) : undefined,
    DEWPOINT_LOW_TEMP:
      dewPointLowData?.temp !== undefined ? String(dewPointLowData.temp) : undefined,
    DEWPOINT_HIGH_RELATIVE_HUMIDITY:
      dewPointHighData?.relativeHumidity !== undefined
        ? String(dewPointHighData.relativeHumidity)
        : undefined,
    DEWPOINT_LOW_RELATIVE_HUMIDITY:
      dewPointLowData?.relativeHumidity !== undefined
        ? String(dewPointLowData.relativeHumidity)
        : undefined,
  };

  // 4) Replace only the enabled tokens; disabled tokens should not appear after filtering
  msg = replaceTokens(msg, tokenValues);

  // Clean up any leftover tokens just in case
  const allKnownTokens = new Set(Object.values(TOKENS_BY_POINT).flatMap((arr) => arr));
  for (const token of allKnownTokens) {
    msg = msg.split(token).join('');
  }
  msg = msg
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!msg) return;

  msg = TAG_ID + '\n' + msg;

  await axios.post(DISCORD_WEBHOOK, { content: msg });
  console.log('Notification to Discord:', msg);
}
