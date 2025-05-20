# Weather High/Low Notifier

This project provides a Node.js (TypeScript) module for automatically monitoring weather temperature data over the last four weeks and sending notifications when temperatures become unusually hot or cold for the current day. Notifications are posted to a Discord channel via webhook, in Swedish or English.

---

## Features

- **Fetches** recent historical and predicted temperature data from configured APIs.
- **Calculates** daily high and low temperatures for the last four weeks.
- **Determines** extreme temperature thresholds using percentiles.
- **Sends** customizable notifications to Discord when today is hotter/colder than usual.
- **Supports** both "live" and "past" notification modes, depending on when highs/lows were recorded.

---

## How it Works

1. **Fetching Data**

   The notifier retrieves:

   - **Historical data** from a weather station (`STATION_URL`)
   - **Predictions** for the current day/future (`PREDICTION_URL`)

2. **Processing**

   - All temperature readings from the last four weeks plus up to and including tomorrow are combined.
   - Temperatures are aggregated per day into daily highs and lows.

3. **Threshold Computation**

   - Using the most recent four weeks, it finds an upper and lower percentile (default 20%) to set "extreme" thresholds.

4. **Notification Decision**

   - For the current day, compares highs/lows with thresholds:
     - If today is both hotter and colder than usual, both messages are sent.
     - If only one threshold is crossed, only the corresponding message is sent.
   - Messages are templated (see [`messages.json`](#messagesjson-for-notifications)), supporting both "forecast" ("it will be") and "past" ("it was").

5. **Notification Delivery**

   - Formatted messages are sent to a Discord webhook specified in environment variables.
   - Messages can tag a Discord role or user.

---

## Project Structure

| Module/File        | Description                                                                         |
| ------------------ | ----------------------------------------------------------------------------------- |
| `weatherHandler`   | Main entrypoint for the scheduled notification (exports `handler` for Lambda/cron). |
| `fetchWeatherData` | Fetches and processes the last 4 weeks' temperature data.                           |
| `notify`           | Composes and sends a notification message to Discord if appropriate.                |
| `temperatureUtils` | Utility functions: date conversions, threshold calculation, etc.                    |
| `models`           | TypeScript interfaces for temperature data.                                         |
| `messages.json`    | Message templates in Swedish and English.                                           |
| `config/env`       | Environment variable setup for API URLs, Discord webhook, and Discord tag.          |
| `localRun.ts`      | Simple script to run the notification manually for testing.                         |

---

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   Create a `.env` file with:

   ```
   STATION_URL=https://path.to/weather-station-api
   PREDICTION_URL=https://path.to/weather-predictions-api
   DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
   TAG_ID=<@role-or-user-id>
   ```

   - `STATION_URL` – Weather station API for historical data (should expose a `.data.value[]` format as used).
   - `PREDICTION_URL` – Weather forecast API for upcoming temperature predictions.
   - `DISCORD_WEBHOOK` – Discord channel webhook for message delivery.
   - `TAG_ID` – Discord role or user mention to tag (e.g. `<@&roleid>` or `<@userid>`).

3. **(Optional) Customize Message Templates**

   Edit `messages.json` to change the wording, language, or add more translations.

---

## Running

### Scheduled/Serverless (AWS Lambda/Cron)

- Exported handler (`export async function handler()`) can be set as the entrypoint for your Lambda, serverless function, or scheduled background job.

### Manual/Development

- You can trigger a notification manually by running:

  ```bash
  npm run ts-node src/localRun.ts
  ```

---

## Configuration Details

### messages.json (for notifications)

Customize per your language and tone. Template variables include:

- `TEMPERATURE_HIGH` – Highest temperature of the day
- `TEMPERATURE_HIGH_TIME` – Time of the day’s high
- `TEMPERATURE_LOW` – Lowest temperature of the day
- `TEMPERATURE_LOW_TIME` – Time of the day’s low

Example (Swedish/past tense):

```json
"hot":  "Det var ganska varmt idag, det blev TEMPERATURE_HIGH°C klockan TEMPERATURE_HIGH_TIME. 🥵"
```

### Data Model

```ts
interface DayTemperature {
  high: number;
  low: number;
  highDate?: number; // Timestamp for the high
  lowDate?: number; // Timestamp for the low
}
```

---

## Notes

- The notification is **only sent when today's high or low is outside the "normal" range**, as defined by configured percentiles (default: 20th/80th).
- Can be extended to support more locales, alternative webhook targets, or other weather metrics.
- Error handling is robust – failures in fetching/processing data will be logged and reported with 500 status, but won’t crash your process.

---

## Example Output

_In Discord, if today is much colder than usual:_

`<@role> Det är ganska kallt idag asså, hela -12°C blir det klockan 07:00. 🥶`

---

## License

MIT

---

## Author

Markussim

---

# END
