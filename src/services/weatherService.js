const CACHE_KEY = 'life_assistant_weather_cache'
const CACHE_TTL_MS = 30 * 60 * 1000

const WEATHER_DESC_ZH = {
  Sunny: '晴',
  Clear: '晴',
  'Partly cloudy': '多云',
  Cloudy: '阴',
  Overcast: '阴',
  Mist: '雾',
  Fog: '雾',
  'Light rain': '小雨',
  'Light rain shower': '小阵雨',
  'Moderate rain': '中雨',
  'Heavy rain': '大雨',
  'Patchy rain nearby': '局部有雨',
  'Light drizzle': '毛毛雨',
  Thunderstorm: '雷阵雨',
  Snow: '雪',
  'Light snow': '小雪',
}

/**
 * @typedef {object} WeatherInfo
 * @property {string} city
 * @property {string} condition
 * @property {string} tempC
 * @property {string} humidity
 * @property {string} windKmph
 * @property {string} advice
 * @property {string} emoji
 * @property {boolean} fromCache
 * @property {boolean} failed
 */

function readCache(city) {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.city !== city) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeCache(city, data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      city,
      fetchedAt: Date.now(),
      data,
    }))
  } catch {
    /* ignore */
  }
}

function translateDesc(desc) {
  if (!desc) return '未知'
  return WEATHER_DESC_ZH[desc] || desc
}

function pickEmoji(condition, tempC) {
  const t = Number(tempC)
  const c = (condition || '').toLowerCase()
  if (/雨|drizzle|rain|shower/.test(c)) return '🌧️'
  if (/雪|snow/.test(c)) return '❄️'
  if (/雷|thunder/.test(c)) return '⛈️'
  if (/雾|mist|fog/.test(c)) return '🌫️'
  if (!Number.isNaN(t) && t >= 33) return '☀️'
  if (!Number.isNaN(t) && t <= 12) return '🧥'
  if (/晴|sunny|clear/.test(c)) return '🌤️'
  return '☁️'
}

export function buildWeatherAdvice(info) {
  const t = Number(info.tempC)
  const c = (info.condition || '').toLowerCase()

  if (/雨|drizzle|rain|shower|雷|thunder/.test(c)) {
    return { advice: '出门记得带伞~', tipTitle: '下雨提醒' }
  }
  if (!Number.isNaN(t) && t <= 12) {
    return { advice: '多穿一点，别着凉~', tipTitle: '降温提醒' }
  }
  if (!Number.isNaN(t) && t >= 33) {
    return { advice: '注意防暑，多喝水~', tipTitle: '高温提醒' }
  }
  if (/雪|snow/.test(c)) {
    return { advice: '路面湿滑，注意保暖~', tipTitle: '雨雪提醒' }
  }
  if (/晴|sunny|clear/.test(c) && t >= 20 && t <= 28) {
    return { advice: '天气不错，适合出门走走~', tipTitle: '今日提示' }
  }
  return { advice: '愿你今天心情好~', tipTitle: '今日提示' }
}

function normalizeWeather(city, json) {
  const cur = json?.current_condition?.[0] || {}
  const zhDesc = cur.lang_zh?.[0]?.value
  const enDesc = cur.weatherDesc?.[0]?.value || ''
  const condition = translateDesc(zhDesc && /[\u4e00-\u9fff]/.test(zhDesc) ? zhDesc : enDesc)

  const info = {
    city,
    condition,
    tempC: cur.temp_C ?? '--',
    humidity: cur.humidity ?? '--',
    windKmph: cur.windspeedKmph ?? '--',
    failed: false,
    fromCache: false,
  }

  const { advice, tipTitle } = buildWeatherAdvice({ ...info, condition: `${condition} ${enDesc}` })
  info.advice = advice
  info.tipTitle = tipTitle
  info.emoji = pickEmoji(`${condition} ${enDesc}`, info.tempC)
  return info
}

/**
 * @param {string} [city]
 * @returns {Promise<WeatherInfo>}
 */
export async function fetchWeather(city = import.meta.env.VITE_WEATHER_CITY || '广州') {
  const cached = readCache(city)
  const url = `/wttr/${encodeURIComponent(city)}?format=j1&lang=zh`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timer)

    if (!res.ok) throw new Error(`weather ${res.status}`)

    const json = await res.json()
    const info = normalizeWeather(city, json)
    writeCache(city, info)
    return info
  } catch {
    if (cached) {
      return { ...cached, fromCache: true, failed: false }
    }
    return {
      city,
      condition: '未知',
      tempC: '--',
      humidity: '--',
      windKmph: '--',
      advice: '天气获取失败，稍后再试~',
      tipTitle: '天气提示',
      emoji: '🌡️',
      failed: true,
      fromCache: false,
    }
  }
}

export function buildProactiveTip(weather) {
  if (weather.failed) {
    return '天气获取失败，使用上次数据'
  }
  const prefix = weather.fromCache ? '（缓存）' : ''
  return `${weather.emoji} ${weather.tipTitle}${prefix}\n${weather.city} ${weather.tempC}°C ${weather.condition}\n${weather.advice}`
}

export function weatherContextText(weather) {
  return [
    `城市：${weather.city}`,
    `天气：${weather.condition}`,
    `温度：${weather.tempC}°C`,
    `湿度：${weather.humidity}%`,
    `风速：${weather.windKmph} km/h`,
    `建议：${weather.advice}`,
  ].join('\n')
}
