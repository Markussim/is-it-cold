export interface DayWeather {
  tempHigh: number;
  tempLow: number;
  highTempDate?: number;
  lowTempDate?: number;
  rainAmount: number;
  dewPointHigh: number;
  dewPointLow: number;
  dewPointHighDate?: number;
  dewPointLowDate?: number;
}

export interface Weather {
  temp: number;
  date: number;
  rain: number;
  dewPoint: number;
}
