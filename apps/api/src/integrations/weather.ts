/**
 * Weather via Open-Meteo (https://open-meteo.com) — real forecasts, no API key. Never fabricated:
 * if the provider fails, the error is surfaced.
 */
export interface WeatherNow {
  provider: 'open-meteo';
  latitude: number;
  longitude: number;
  temperatureC: number;
  apparentC: number;
  precipitationProbability: number | null;
  weatherCode: number;
  description: string;
  todayMinC: number;
  todayMaxC: number;
  fetchedAt: string;
}

const CODES: Record<number, string> = {
  0: 'céu limpo', 1: 'predominantemente limpo', 2: 'parcialmente nublado', 3: 'nublado', 45: 'neblina', 48: 'neblina com geada',
  51: 'garoa fraca', 53: 'garoa', 55: 'garoa forte', 61: 'chuva fraca', 63: 'chuva', 65: 'chuva forte', 71: 'neve fraca', 73: 'neve', 75: 'neve forte',
  80: 'pancadas de chuva fracas', 81: 'pancadas de chuva', 82: 'pancadas de chuva fortes', 95: 'trovoadas', 96: 'trovoadas com granizo', 99: 'trovoadas fortes com granizo',
};

export async function fetchWeather(latitude: number, longitude: number, timezone: string): Promise<WeatherNow> {
  const p = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current: 'temperature_2m,apparent_temperature,weather_code',
    daily: 'temperature_2m_min,temperature_2m_max,precipitation_probability_max',
    timezone,
    forecast_days: '1',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const j = (await res.json()) as {
    current: { temperature_2m: number; apparent_temperature: number; weather_code: number };
    daily: { temperature_2m_min: number[]; temperature_2m_max: number[]; precipitation_probability_max: Array<number | null> };
  };
  return {
    provider: 'open-meteo',
    latitude,
    longitude,
    temperatureC: j.current.temperature_2m,
    apparentC: j.current.apparent_temperature,
    precipitationProbability: j.daily.precipitation_probability_max[0] ?? null,
    weatherCode: j.current.weather_code,
    description: CODES[j.current.weather_code] ?? 'condição desconhecida',
    todayMinC: j.daily.temperature_2m_min[0] ?? j.current.temperature_2m,
    todayMaxC: j.daily.temperature_2m_max[0] ?? j.current.temperature_2m,
    fetchedAt: new Date().toISOString(),
  };
}
