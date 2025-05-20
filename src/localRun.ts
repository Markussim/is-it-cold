import { config } from 'dotenv';
config();

// src/localRun.ts
import { handler } from './handlers/weatherHandler';

(async () => {
  // You can pass a dummy event if required
  await handler(/* optional event */);
})();
