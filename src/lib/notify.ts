import axios from 'axios';
import { Buffer } from 'buffer';
import process from 'process';
import { getExtremeThresholds, unixToDate, unixTimeToTimeOfDay } from './weatherUtils';
import { DISCORD_WEBHOOK } from '../config/env';
import messages from '../messages.json';
import { DayWeather, Weather } from '../models';
import { TAG_ID } from '../config/env';
import console from 'console';

// 1) Define which data points can be toggled on/off,
//    and which placeholders each point controls.
type DataPoint = 'tempHigh' | 'tempLow' | 'dewPointHigh' | 'dewPointLow' | 'rain' | 'windSpeedHigh';

type Language = 'sv' | 'sv-serious';

// Edit this array to control which datapoints are allowed in the final message:
const ENABLED_DATA_POINTS: DataPoint[] = ['tempHigh', 'tempLow', 'rain', 'windSpeedHigh'];

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
  windSpeedHigh: ['WIND_SPEED_HIGH', 'WIND_SPEED_HIGH_TIME'],
};

const TOKEN_START = '{{';
const TOKEN_END = '}}';

function wrapToken(token: string): string {
  return `${TOKEN_START}${token}${TOKEN_END}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Helper: filter out any lines that reference disabled datapoints
function filterMessageByEnabledPoints(msg: string, enabledPoints: Set<DataPoint>): string {
  const disabledTokens = Object.entries(TOKENS_BY_POINT)
    .filter(([point]) => !enabledPoints.has(point as DataPoint))
    .flatMap(([, tokens]) => tokens.map(wrapToken)); // look for {{TOKEN}}

  const lines = msg.split('\n');

  const filtered = lines.filter((line) => !disabledTokens.some((tok) => line.includes(tok)));

  return filtered
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Helper: replace tokens safely
function replaceTokens(msg: string, values: Record<string, string | undefined>): string {
  const tokens = Object.keys(values);
  if (tokens.length === 0) return msg;

  // Build a regex that matches any {{TOKEN}} in values
  const pattern = new RegExp(tokens.map((t) => escapeRegExp(wrapToken(t))).join('|'), 'g');

  return msg.replace(pattern, (match) => {
    // Extract the bare token name from {{TOKEN}}
    const key = match.slice(TOKEN_START.length, match.length - TOKEN_END.length);
    const val = values[key];
    return val !== undefined ? val : match; // leave it for cleanup if undefined
  });
}

function buildNotificationMessage(
  language: Language,
  todayTemps: DayWeather,
  nowDate: number,
  thresholds: {
    lowTempThreshold: number;
    highTempThreshold: number;
    lowDewPointThreshold: number;
    highDewPointThreshold: number;
    rainThreshold: number;
    windSpeedHighThreshold: number;
  },
): string | null {
  const langMessages = messages.notifications[language];

  let msg: string | null = null;

  const {
    tempHigh,
    tempLow,
    highTempDate,
    lowTempDate,
    dewPointHighDate,
    dewPointLowDate,
    windSpeedHighDate,
  } = todayTemps;

  const {
    lowTempThreshold,
    highTempThreshold,
    lowDewPointThreshold,
    highDewPointThreshold,
    rainThreshold,
    windSpeedHighThreshold,
  } = thresholds;

  // temperature / wind
  if (tempHigh > highTempThreshold && tempLow < lowTempThreshold) {
    msg = langMessages.current.both;
  } else if (tempHigh > highTempThreshold) {
    msg = highTempDate && nowDate > highTempDate ? langMessages.past.hot : langMessages.current.hot;
  } else if (tempLow < lowTempThreshold) {
    msg = lowTempDate && nowDate > lowTempDate ? langMessages.past.cold : langMessages.current.cold;
  } else if (todayTemps.windSpeedHigh > windSpeedHighThreshold) {
    msg =
      windSpeedHighDate && nowDate > windSpeedHighDate
        ? (langMessages.past as any)?.wind || langMessages.current.wind
        : langMessages.current.wind;
  }

  const isDewHighPast = dewPointHighDate && nowDate > dewPointHighDate;
  const isDewLowPast = dewPointLowDate && nowDate > dewPointLowDate;

  // humidity
  if (
    todayTemps.dewPointHigh > highDewPointThreshold &&
    todayTemps.dewPointLow < lowDewPointThreshold
  ) {
    msg = msg ? msg + '\n' : '';
    msg += langMessages.current.humidityBoth;
  } else if (todayTemps.dewPointHigh > highDewPointThreshold) {
    msg = msg ? msg + '\n' : '';
    msg += isDewHighPast ? langMessages.past.humid : langMessages.current.humid;
  } else if (todayTemps.dewPointLow < lowDewPointThreshold) {
    msg = msg ? msg + '\n' : '';
    msg += isDewLowPast ? langMessages.past.dry : langMessages.current.dry;
  }

  // rain
  if (todayTemps.rainAmount > rainThreshold) {
    if (msg) {
      msg += '\n';
    } else {
      msg = '';
    }
    msg += langMessages.current.rain;
  }

  return msg;
}

function finalizeMessage(
  msg: string | null,
  weatherArray: Weather[],
  todayTemps: DayWeather,
  tempLow: number,
  tempHigh: number,
  lowTempDate: number | undefined,
  highTempDate: number | undefined,
  dewPointHighDate: number | undefined,
  dewPointLowDate: number | undefined,
): string | null {
  if (!msg) return null;

  const enabled = new Set(ENABLED_DATA_POINTS);
  msg = filterMessageByEnabledPoints(msg, enabled);
  if (!msg) return null;

  const dewPointHighData = weatherArray.find((w) => w.date === dewPointHighDate);
  const dewPointLowData = weatherArray.find((w) => w.date === dewPointLowDate);

  const tokenValues: Record<string, string | undefined> = {
    TEMPERATURE_LOW: String(tempLow),
    TEMPERATURE_HIGH: String(tempHigh),
    TEMPERATURE_LOW_TIME: unixTimeToTimeOfDay(lowTempDate),
    TEMPERATURE_HIGH_TIME: unixTimeToTimeOfDay(highTempDate),

    WIND_SPEED_HIGH: todayTemps.windSpeedHigh.toFixed(1),
    WIND_SPEED_HIGH_TIME: unixTimeToTimeOfDay(todayTemps.windSpeedHighDate),
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

  msg = replaceTokens(msg, tokenValues);

  const allKnownTokens = new Set(Object.values(TOKENS_BY_POINT).flatMap((arr) => arr));
  for (const token of allKnownTokens) {
    msg = msg.split(wrapToken(token)).join('');
  }

  msg = msg
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return msg || null;
}

export async function sendNotification(
  highLowDays: Map<string, DayWeather>,
  now: Date,
  weatherArray: Weather[],
): Promise<void> {
  const {
    lowTempThreshold,
    highTempThreshold,
    lowDewPointThreshold,
    highDewPointThreshold,
    rainThreshold,
    windSpeedHighThreshold,
  } = getExtremeThresholds(highLowDays, 20);

  const todayKey = unixToDate(now.getTime());
  const todayTemps = highLowDays.get(todayKey);

  if (!todayTemps) {
    console.warn('No temperature data for today.');
    return;
  }

  const { tempHigh, tempLow, highTempDate, lowTempDate, dewPointHighDate, dewPointLowDate } =
    todayTemps;

  const nowDate = Date.now();

  console.info({
    highTempThreshold,
    lowTempThreshold,
    highDewPointThreshold,
    lowDewPointThreshold,
    rainThreshold,
    windSpeedHighThreshold,
  });

  console.info({
    lowTemp: tempLow,
    highTemp: tempHigh,
    rain: Number(todayTemps.rainAmount.toFixed(2)),
    dewPointHigh: todayTemps.dewPointHigh,
    dewPointLow: todayTemps.dewPointLow,
    windSpeedHigh: todayTemps.windSpeedHigh,
  });

  const thresholds = {
    lowTempThreshold,
    highTempThreshold,
    lowDewPointThreshold,
    highDewPointThreshold,
    rainThreshold,
    windSpeedHighThreshold,
  };

  // Build raw messages for each channel
  let discordMsg = buildNotificationMessage('sv', todayTemps, nowDate, thresholds);
  let smsMsg = buildNotificationMessage('sv-serious', todayTemps, nowDate, thresholds);

  // Finalize both messages
  discordMsg = finalizeMessage(
    discordMsg,
    weatherArray,
    todayTemps,
    tempLow,
    tempHigh,
    lowTempDate,
    highTempDate,
    dewPointHighDate,
    dewPointLowDate,
  );

  smsMsg = finalizeMessage(
    smsMsg,
    weatherArray,
    todayTemps,
    tempLow,
    tempHigh,
    lowTempDate,
    highTempDate,
    dewPointHighDate,
    dewPointLowDate,
  );

  // Send Discord in "sv"
  if (discordMsg) {
    await sendDiscordWebhook(TAG_ID + '\n' + discordMsg);
  }

  // Send SMS in "sv-serious"
  if (smsMsg) {
    // Comma seperated list of numbers to notify from environment variable
    const numbersToNotify = process.env.NUMBERS_TO_NOTIFY?.split(',').map((num) => num.trim());

    console.info('Numbers to notify:', numbersToNotify);
    if (numbersToNotify && numbersToNotify.length > 0) {
      for (const number of numbersToNotify) {
        await sendSMSNotification(smsMsg, number);
      }
    } else {
      console.info('No phone numbers specified in NUMBERS_TO_NOTIFY. SMS notification skipped.');
    }
  }
}

async function sendDiscordWebhook(content: string): Promise<void> {
  try {
    await axios.post(DISCORD_WEBHOOK, { content });
    console.log('Notification sent to Discord.');
  } catch (error) {
    console.error('Error sending notification to Discord:', error);
  }
}

async function sendSMSNotification(content: string, to: string): Promise<void> {
  try {
    const username = process.env.SMS_API_USERNAME;
    const password = process.env.SMS_API_PASSWORD;
    const from = process.env.SMS_FROM;
    if (!username || !password || !from || !to) {
      console.info('SMS notification skipped: missing SMS environment variables.');
      return;
    }

    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    const message = content.replace(/\r?\n/g, ' ').trim();

    const payload = new URLSearchParams({
      from,
      to,
      message,
    }).toString();

    const response = await axios.post('https://api.46elks.com/a1/sms', payload, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    console.log('SMS notification sent:', response.data);
  } catch (error) {
    console.error('Error sending SMS notification:', error);
  }
}
