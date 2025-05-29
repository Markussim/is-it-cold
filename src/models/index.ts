export interface DayWeather {
  tempHigh: number;
  tempLow: number;
  highDate?: number;
  lowDate?: number;
  rainAmount: number;
}

export interface Weather {
  temp: number;
  date: number;
  rain: number;
}
