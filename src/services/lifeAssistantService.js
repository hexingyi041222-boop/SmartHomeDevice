import { weatherContextText } from './weatherService'

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'
const API_TIMEOUT_MS = 30000

const SYSTEM_PROMPT = `你是嵌入智能家居页面中的「智能助手」。对外只以智能助手身份与用户交流，不要主动提及 DeepSeek 或底层模型名称。
你具备与通用大模型相当的问答能力，可回答知识、写作、翻译、编程、分析、创意、闲聊等各类问题；回答应准确、清晰、有帮助。
若用户询问本页面的设备控制（开灯、空调、门锁等），可简要说明请使用页面右侧的控制按钮，但仍可继续回答其他问题。
下方可能附带当前当地天气，可在与天气相关的问题中参考。`

/**
 * @param {string} input
 * @param {object} weather
 */
export function replyLocally(input, weather) {
  const text = input.trim()
  if (!text) return '请输入消息后发送。'

  const w = weather || {}
  if (/天气|气温|温度|下雨|带伞|穿衣/.test(text) && !w.failed) {
    return `当前${w.city || '当地'} ${w.tempC}°C，${w.condition}。${w.advice || ''}（网络异常，此为本地简要回复）`
  }

  return '服务暂时不可用，请稍后再试。'
}

/**
 * @param {string} userInput
 * @param {object} weather
 * @param {Array<{role:string,text:string}>} history
 */
export async function chatWithLifeAssistant(userInput, weather, history = []) {
  if (!navigator.onLine) {
    return { reply: '网络连接失败，稍后再试', offline: true }
  }

  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY
  if (!apiKey) {
    return { reply: replyLocally(userInput, weather), offline: true }
  }

  const weatherBlock = weather && !weather.failed
    ? `\n\n参考天气：\n${weatherContextText(weather)}`
    : ''

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + weatherBlock },
      ...history.slice(-12).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      })),
      { role: 'user', content: userInput },
    ]

    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!res.ok) throw new Error(`DeepSeek ${res.status}`)

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content?.trim()
    return { reply: content || '暂无回复，请重试。', offline: false }
  } catch {
    return { reply: replyLocally(userInput, weather), offline: true }
  }
}
