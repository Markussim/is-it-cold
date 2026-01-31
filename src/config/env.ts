import process from 'process';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value === 'undefined' || value === '') {
    throw new Error(`Environment variable '${name}' is not set`);
  }
  return value;
}

export const STATION_URL_TEMP: string = requireEnv('STATION_URL_TEMP');
export const STATION_URL_RAIN: string = requireEnv('STATION_URL_RAIN');
export const STATION_URL_HUMIDITY: string = requireEnv('STATION_URL_HUMIDITY');
export const STATION_URL_WIND: string = requireEnv('STATION_URL_WIND');
export const PREDICTION_URL: string = requireEnv('PREDICTION_URL');
export const DISCORD_WEBHOOK: string = requireEnv('DISCORD_WEBHOOK');
export const TAG_ID: string = requireEnv('TAG_ID');
