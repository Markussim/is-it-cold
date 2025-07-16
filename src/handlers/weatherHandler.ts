import { getFourWeeksHighLow } from '../lib/fetchWeatherData';
import { sendNotification } from '../lib/notify';
import console from 'console';

export async function handler(): Promise<{ status: number; body?: string }> {
  try {
    const { highLowDays, now, weatherArray } = await getFourWeeksHighLow();
    await sendNotification(highLowDays, now, weatherArray);
    return { status: 200 };
  } catch (err: any) {
    console.error('Failure in weather handler:', err);
    return { status: 500, body: err.message };
  }
}
