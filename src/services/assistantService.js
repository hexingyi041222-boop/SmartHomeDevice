const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions'
const API_TIMEOUT_MS = 10000

const SYSTEM_PROMPT = `你是一个智能家居控制助手，不是通用聊天机器人。
你的职责：
1. 识别用户指令并转换为设备操作（关灯/开灯/调空调/远程开门/健康检查/状态摘要）
2. 解释日志和错误
3. 给出简短、专业的回复，不要闲聊

可用设备：
- 客厅主灯（light）：on/off
- 客厅空调（ac）：on/off（暂不支持精确温度，若用户指定温度则开启空调并在 response 中说明目标温度）
- 大门锁/门锁（door）：open/unlock/close/lock

输出格式要求（严格遵守）：
如果是设备指令：{"action":"device","device":"light|ac|door","command":"on|off|open|close|unlock|lock","target":"客厅主灯","response":"已关闭客厅主灯","temp":24}
如果是查询/摘要：{"action":"summary","response":"..."}
如果是健康检查：{"action":"health","response":"..."}
如果是日志解释：{"action":"explain","response":"..."}
如果无法识别：{"action":"reject","response":"我仅支持设备控制、健康检查和状态查询"}

只输出 JSON，不要输出其他内容。`

const DEVICE_ALIASES = {
  light: ['灯', '照明', '主灯', '客厅主灯', '灯光'],
  ac: ['空调', '客厅空调', '冷气'],
  door: ['门', '门锁', '大门', '大门锁'],
}

/** @typedef {{ action: string, device?: string, command?: string, target?: string, response: string, temp?: number }} AssistantAction */

/**
 * @param {string} raw
 * @returns {AssistantAction|null}
 */
export function parseAssistantJson(raw) {
  if (!raw) return null
  const trimmed = raw.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        return null
      }
    }
  }
  return null
}

/**
 * @param {object} ctx
 * @param {string} userInput
 * @returns {AssistantAction}
 */
export function parseLocalCommand(userInput, ctx = {}) {
  const text = userInput.trim().toLowerCase()
  if (!text) {
    return { action: 'reject', response: '请输入指令或问题' }
  }

  if (/健康检查|系统检查|检查状态/.test(text)) {
    return { action: 'health', response: buildHealthSummary(ctx) }
  }

  if (/状态摘要|当前状态|系统摘要|概况/.test(text)) {
    return { action: 'summary', response: buildStatusSummary(ctx) }
  }

  const lightOff = /关灯|关闭照明|关闭主灯|关主灯/.test(text)
  const lightOn = /开灯|打开照明|打开主灯|开主灯|打开灯/.test(text)
  if (lightOff || lightOn) {
    return {
      action: 'device',
      device: 'light',
      command: lightOff ? 'off' : 'on',
      target: '客厅主灯',
      response: lightOff ? '已关闭客厅主灯' : '已开启客厅主灯',
    }
  }

  const acOff = /关空调|关闭空调|关掉空调/.test(text)
  const acOn = /开空调|打开空调|开启空调/.test(text)
  const tempMatch = text.match(/(\d{1,2})\s*度/)
  if (acOff || acOn || tempMatch) {
    const temp = tempMatch ? Number(tempMatch[1]) : undefined
    const turnOn = acOn || !!tempMatch
    let response = turnOn ? '已开启客厅空调' : '已关闭客厅空调'
    if (temp !== undefined) {
      response = `已开启客厅空调（目标 ${temp}°C，硬件当前仅支持开关）`
    }
    return {
      action: 'device',
      device: 'ac',
      command: turnOn ? 'on' : 'off',
      target: '客厅空调',
      response,
      temp,
    }
  }

  const doorOpen = /远程开门|开门|解锁|开锁/.test(text)
  const doorClose = /关门|锁门|上锁/.test(text)
  if (doorOpen || doorClose) {
    return {
      action: 'device',
      device: 'door',
      command: doorOpen ? 'open' : 'close',
      target: '大门锁',
      response: doorOpen ? '已发送远程开门指令' : '已发送关门指令',
    }
  }

  return { action: 'reject', response: '我仅支持设备控制、健康检查和状态查询' }
}

/**
 * @param {object} log
 * @param {Record<string,string>} deviceLabels
 */
export function explainLogLocally(log, deviceLabels = {}) {
  const device = deviceLabels[log.device_type] || log.device_type || '设备'
  const action = log.action || '未知操作'
  const operator = log.operator || '未知用户'
  const time = log.timestamp
    ? new Date(log.timestamp).toLocaleString('zh-CN')
    : '未知时间'

  const actionMap = {
    on: '开启',
    off: '关闭',
    open: '开门',
    close: '关门',
    lock: '上锁',
    unlock: '解锁',
    开启: '开启',
    关闭: '关闭',
  }
  const actionText = actionMap[action] || action

  let detail = `这是一条${device}的「${actionText}」操作记录，由 ${operator} 于 ${time} 执行。`
  if (log.device_type === 'door' && ['open', 'unlock', '开启'].includes(action)) {
    detail = `正常开门操作，由 ${operator} 于 ${time} 执行。`
  } else if (log.device_type === 'door' && ['close', 'lock', '锁定', '关闭'].includes(action)) {
    detail = `正常关门/上锁操作，由 ${operator} 于 ${time} 执行。`
  } else if (log.device_type === 'light') {
    detail = `照明${actionText}操作，由 ${operator} 执行，时间 ${time}。`
  } else if (log.device_type === 'ac') {
    detail = `空调${actionText}操作，由 ${operator} 执行，时间 ${time}。`
  }

  return { action: 'explain', response: detail }
}

export function buildStatusSummary(ctx) {
  const offlineCount = countOfflineDevices(ctx)
  const temp = formatVal(ctx.temperature)
  const humi = formatVal(ctx.humidity)
  const mqtt = ctx.mqttConnected ? 'MQTT 在线' : 'MQTT 离线'
  return `当前：${offlineCount} 个设备离线，室温 ${temp}°C，湿度 ${humi}%，${mqtt}`
}

export function buildHealthSummary(ctx) {
  const lines = []
  lines.push(`MQTT：${ctx.mqttConnected ? '✅ 已连接' : '❌ 未连接'}`)
  if (ctx.brokerLabel) lines.push(`中继：${ctx.brokerLabel}`)

  const devices = ctx.devices || {}
  Object.entries(devices).forEach(([name, info]) => {
    const status = info.online ? '在线' : '离线'
    const state = info.stateLabel ? `，${info.stateLabel}` : ''
    lines.push(`${name}：${status}${state}`)
  })

  if (ctx.lastAnomalyAt) {
    lines.push(`最后异常：${new Date(ctx.lastAnomalyAt).toLocaleString('zh-CN')}`)
  } else {
    lines.push('最后异常：暂无记录')
  }

  if (ctx.lastMessageAt) {
    lines.push(`最近数据：${new Date(ctx.lastMessageAt).toLocaleString('zh-CN')}`)
  } else {
    lines.push('最近数据：无')
  }

  return lines.join('\n')
}

function countOfflineDevices(ctx) {
  const devices = ctx.devices || {}
  return Object.values(devices).filter((d) => !d.online).length
}

function formatVal(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '--'
  return Number(v).toFixed(1)
}

/**
 * @param {string} userInput
 * @param {object} ctx
 * @returns {Promise<{ result: AssistantAction, offlineMode: boolean }>}
 */
export async function resolveAssistantIntent(userInput, ctx = {}) {
  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY
  if (!apiKey) {
    return { result: parseLocalCommand(userInput, ctx), offlineMode: true }
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

    const contextHint = `当前系统状态：${buildStatusSummary(ctx)}`
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'system', content: contextHint },
          { role: 'user', content: userInput },
        ],
        temperature: 0.1,
        max_tokens: 512,
      }),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!res.ok) {
      throw new Error(`DeepSeek API ${res.status}`)
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content || ''
    const parsed = parseAssistantJson(content)
    if (parsed?.response) {
      return { result: parsed, offlineMode: false }
    }
    throw new Error('无法解析 AI 响应')
  } catch {
    return { result: parseLocalCommand(userInput, ctx), offlineMode: true }
  }
}

/**
 * @param {object} log
 * @param {object} ctx
 * @param {Record<string,string>} deviceLabels
 */
export async function resolveLogExplanation(log, ctx, deviceLabels) {
  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY
  const local = explainLogLocally(log, deviceLabels)

  if (!apiKey) {
    return { result: local, offlineMode: true }
  }

  const logText = `${deviceLabels[log.device_type] || log.device_type} ${log.action} ${log.operator} ${log.timestamp}`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `请解释以下操作日志（只输出 explain JSON）：${logText}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 256,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error('API error')
    const data = await res.json()
    const parsed = parseAssistantJson(data?.choices?.[0]?.message?.content || '')
    if (parsed?.action === 'explain' && parsed.response) {
      return { result: parsed, offlineMode: false }
    }
  } catch {
    /* fallback */
  }
  return { result: local, offlineMode: true }
}

export function checkEnvAnomaly(temperature, humidity) {
  const alerts = []
  if (temperature !== null && temperature !== undefined) {
    const t = Number(temperature)
    if (!Number.isNaN(t) && (t > 35 || t < 10)) {
      alerts.push(`⚠️ 温度异常：${t.toFixed(1)}°C（正常范围 10–35°C）`)
    }
  }
  if (humidity !== null && humidity !== undefined) {
    const h = Number(humidity)
    if (!Number.isNaN(h) && (h > 80 || h < 20)) {
      alerts.push(`⚠️ 湿度异常：${h.toFixed(1)}%（正常范围 20–80%）`)
    }
  }
  return alerts
}

export function resolveDeviceKey(target) {
  if (!target) return null
  const t = target.toLowerCase()
  for (const [device, aliases] of Object.entries(DEVICE_ALIASES)) {
    if (aliases.some((a) => t.includes(a) || target.includes(a))) return device
  }
  return null
}
