# Weather High/Low Notifier

This is a Node.js (TypeScript) module for **automatically monitoring local weather** over the last four weeks and sending notifications when today's weather is unusually hot, cold, or rainy. Notifications are posted to a Discord channel via webhook, and messages are customizable and translatable.

---

## Features

- **Fetches** recent historical and predicted temperature/rain data.
- **Aggregates** daily highs, lows, and rain totals for a rolling 4-week window.
- **Calculates** "extreme" thresholds using percentiles for high, low, and rain.
- **Notifies** on Discord when today is unusually hot, cold, or rainy, with templated messages.
- **Summarizes** in both "live" (“is”) and "past" (“was”) tenses depending on time of peak/trough.
- **Extensible**: Add new languages or tweak percentiles via messages/config.

---

## How It Works

1. **Data Fetching:**
   - Downloads temperature and rain from a historical station API; predictions for today/tomorrow from a forecast API.
   - You control data sources via the `.env` file.
2. **Processing:**
   - Combines source data, calculates daily highs/lows/rain amounts over the past four weeks (to support percentile algorithms).
   - Handles missing/outlier/invalid values carefully.
3. **Thresholds:**
   - Percentile-based: "extreme heat/cold" means hotter/cooler than X% of days in the window.
   - Rain exceeds "extreme" if today’s rain is more than, e.g., the top 40th percentile (configurable).
4. **Notifications:**
   - For the present day, the notifier checks if thresholds are exceeded. If so, sends a templated, customizable Discord message.
   - Notifies about current or past highs/lows/rain, including time-of-day (e.g., "klockan 14:00").
   - Tags a specified Discord role or user.
5. **Reliability:**
   - Robust error handling: logs fetch/processing failures, reports errors as 500s, never crashes your process.
   - Supports Lambda/serverless, or can be run standalone for testing.

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file in the project root with the following:

```ini
STATION_URL_TEMP=https://path.to/weather-station-temp-api
STATION_URL_RAIN=https://path.to/weather-station-rain-api
PREDICTION_URL=https://path.to/weather-predictions-api
DISCORD_WEBHOOK=https://discord.com/api/webhooks/...
TAG_ID=<@role-or-user-id>
```

- The historical data sources must provide arrays in the format: `{ value: [{ date: unixMs, value: number }, ...] }`.
- Prediction API must expose `.data.timeSeries[]` as used.

### 3. (Optional) Edit Message Templates

Edit `messages.json` to change wording, add more languages, or adjust tone.

---

## Running

### Scheduled (Serverless / AWS Lambda / Cron)

Point your scheduler/serverless handler to the main export:

```ts
export async function handler(): Promise<{ status: number; body?: string }> {
  // ...
}
```

### Manual / Development

Manually trigger a notification (for testing):

```bash
npm run dev
```

---

## Project Structure

| Module/File                      | Description                                             |
| -------------------------------- | ------------------------------------------------------- |
| `src/handlers/weatherHandler.ts` | **Entrypoint:** Lambda/cron handler (`export handler`). |
| `src/lib/fetchWeatherData.ts`    | Fetch and aggregate past 4 weeks of temperatures/rain.  |
| `src/lib/notify.ts`              | Compose/send Discord message, decide when to notify.    |
| `src/lib/weatherUtils.ts`        | Date conversions, percentile (threshold) helpers, etc.  |
| `src/models.ts`                  | TypeScript interfaces for daily weather objects.        |
| `src/messages.json`              | Language- and situation-specific message templates.     |
| `src/config/env.ts`              | Loads and exports environmental variables.              |
| `src/localRun.ts`                | Manually run the notifier for testing/dev.              |

---

## Message Templates

Message templates are in [`messages.json`](src/messages.json), keyed by event type and language. Variables are:

- `TEMPERATURE_HIGH`, `TEMPERATURE_HIGH_TIME`
- `TEMPERATURE_LOW`, `TEMPERATURE_LOW_TIME`
- `RAIN_AMOUNT`

Example (Swedish, "past" notification):

```json
"hot":  "Det är ganska varmt idag asså, hela TEMPERATURE_HIGH°C blir det klockan TEMPERATURE_HIGH_TIME. 🥵"
```

---

## Data Models & Percentiles

Daily weather object:

```typescript
interface DayWeather {
  tempHigh: number;
  tempLow: number;
  highDate: number; // unix ms timestamp
  lowDate: number; // unix ms timestamp
  rainAmount: number;
}
```

Percentile cutoff calculation takes all highs, lows, and rain totals from the previous 28 days, sorts them, finds the Xth/100th value to determine "abnormally cold/hot/wet".

---

## Customization & Extending

- **Localization:** Add more languages to `messages.json`.
- **Change thresholds:** Edit percentile (e.g. 20th/80th) in code or config.
- **Add metrics:** Add support for wind, humidity, or other weather events.
- **Alternative channels:** Swap Discord webhook for Slack, email, etc.

---

## Example Output

_In Discord, if today was much colder than normal:_

```
<@role>
Det är ganska kallt idag asså, hela -12°C blir det klockan 07:00. 🥶
```

_Or if both thresholds exceeded, both messages are included._

---

## Troubleshooting

- If no notification is sent: Likely today's values are not "extreme" vs. the last four weeks.
- Data missing? Check the APIs, .env variables, and expected data format.
- For logs/errors, see console/stderr or your serverless logs.

---

## License

MIT

---

## Author

Markussim

---

# END
