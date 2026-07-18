import mqtt from 'mqtt'
import { ref } from 'vue'

/** 局域网 Broker 仅开放 TCP 1883 时，浏览器经后端中继 */
const USE_BACKEND_RELAY = import.meta.env.VITE_MQTT_USE_BACKEND !== 'false'

/** MQTT Broker 配置（直连 WebSocket 模式） */
export const MQTT_CONFIG = {
  brokerUrl: import.meta.env.VITE_MQTT_BROKER || 'ws://192.168.3.45:1883/mqtt',
  protocolVersion: 4,
  reconnectPeriod: 5000,
  connectTimeout: 10000,
  clean: true,
}

/** Topic 定义 */
export const MQTT_TOPICS = {
  DEVICE1_STATUS: 'dorm/device1/status',
  DEVICE2_DATA: 'dorm/device2/data',
  DEVICE2_CMD: 'dorm/device2/cmd',
  DEVICE3_STATUS: 'dorm/device3/status',
  DEVICE1_CMD: 'dorm/device1/cmd',
  DEVICE3_CMD: 'dorm/device3/cmd',
}

const SUBSCRIBE_TOPICS = [
  MQTT_TOPICS.DEVICE1_STATUS,
  MQTT_TOPICS.DEVICE2_DATA,
  MQTT_TOPICS.DEVICE3_STATUS,
]

/** 灯光 / 门锁状态（Vue 响应式，供 Pinia / UI 读取） */
export const lightStatus = ref(null)
export const lightType = ref(null)
export const doorStatus = ref(null)
export const doorType = ref(null)

/** 环境传感器 / 空调状态（Vue 响应式，供 Pinia / UI 读取） */
export const temperature = ref(null)
export const humidity = ref(null)
export const ac = ref(null)

/** 连接状态（供 Pinia / UI 读取） */
export const mqttData = {
  mqttConnected: false,
  connecting: false,
  error: '',
  lastMessageAt: null,
  lastDeviceMessageAt: null,
  relayMode: USE_BACKEND_RELAY,
}

let client = null
let relaySocket = null
let healthTimer = null
let stateListener = null

function notifyStateChange() {
  stateListener?.(mqttData)
}

function markDeviceMessageReceived() {
  mqttData.lastDeviceMessageAt = Date.now()
  mqttData.lastMessageAt = new Date()
}

function handleDevice1Status(data) {
  if (data.door_status !== undefined) {
    doorStatus.value = Number(data.door_status)
  }
  if (data.type !== undefined) {
    doorType.value = data.type
  }
  console.log('[MQTT] 门锁状态更新:', {
    door_status: doorStatus.value,
    type: doorType.value,
  })
}

function handleDevice2Data(data) {
  if (data.temp !== undefined) {
    temperature.value = Number(data.temp)
    if (temperature.value === 0.0) {
      console.warn('传感器离线或数据异常')
    }
  }
  if (data.humi !== undefined) {
    humidity.value = Number(data.humi)
    if (humidity.value === 0.0) {
      console.warn('传感器离线或数据异常')
    }
  }
  if (data.ac !== undefined) {
    ac.value = Number(data.ac)
  }
  console.log('[MQTT] 环境数据更新:', {
    temp: temperature.value,
    humi: humidity.value,
    ac: ac.value,
  })
}

function handleDevice3Status(data) {
  if (data.light_status !== undefined) {
    lightStatus.value = Number(data.light_status)
  }
  if (data.type !== undefined) {
    lightType.value = data.type
  }
  console.log('[MQTT] 灯光状态更新:', {
    light_status: lightStatus.value,
    type: lightType.value,
  })
}

function routeDormMessage(topic, data) {
  markDeviceMessageReceived()

  switch (topic) {
    case MQTT_TOPICS.DEVICE1_STATUS:
      handleDevice1Status(data)
      break
    case MQTT_TOPICS.DEVICE2_DATA:
      handleDevice2Data(data)
      break
    case MQTT_TOPICS.DEVICE3_STATUS:
      handleDevice3Status(data)
      break
    default:
      console.log('[MQTT] 未处理的消息:', topic, data)
  }

  notifyStateChange()
}

function handleMessage(topic, payload) {
  const raw = payload.toString().trim()
  let data

  try {
    data = JSON.parse(raw)
  } catch (err) {
    console.error('[MQTT] JSON 解析失败:', topic, raw, err)
    return
  }

  routeDormMessage(topic, data)
}

function subscribeTopics() {
  if (!client) return

  SUBSCRIBE_TOPICS.forEach((topic) => {
    client.subscribe(topic, { qos: 1 }, (err) => {
      if (err) {
        console.error('[MQTT] 订阅失败:', topic, err)
      } else {
        console.log('[MQTT] 已订阅:', topic)
      }
    })
  })
}

async function checkBackendMqttHealth() {
  try {
    const res = await fetch('/api/health')
    if (!res.ok) return false
    const health = await res.json()
    return health.mqtt_connected === true
  } catch {
    return false
  }
}

function openBackendRelaySocket() {
  if (relaySocket) {
    relaySocket.close()
    relaySocket = null
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/api/ws/dorm`
  console.log('[MQTT] 连接后端中继 WebSocket:', wsUrl)

  relaySocket = new WebSocket(wsUrl)

  relaySocket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.event === 'dorm_message' && msg.data?.topic) {
        routeDormMessage(msg.data.topic, msg.data.payload)
      } else if (msg.event === 'mqtt_status') {
        mqttData.mqttConnected = !!msg.data?.connected
        notifyStateChange()
      }
    } catch (err) {
      console.error('[MQTT] 中继消息解析失败:', err)
    }
  }

  relaySocket.onerror = () => {
    mqttData.error = '后端 WebSocket 连接异常'
    notifyStateChange()
  }

  relaySocket.onclose = () => {
    if (!healthTimer) return
    setTimeout(() => {
      if (healthTimer && mqttData.mqttConnected) {
        openBackendRelaySocket()
      }
    }, 5000)
  }
}

async function initBackendRelay(onStateChange) {
  stateListener = onStateChange ?? null
  mqttData.connecting = true
  mqttData.error = ''
  notifyStateChange()

  console.log('[MQTT] 使用后端 TCP 中继（Broker 仅 1883 TCP）')

  const connected = await checkBackendMqttHealth()
  mqttData.mqttConnected = connected
  mqttData.connecting = false
  mqttData.error = connected ? '' : '后端 MQTT 未连接，请确认 Broker 已启动'

  if (connected) {
    openBackendRelaySocket()
  }

  healthTimer = setInterval(async () => {
    const ok = await checkBackendMqttHealth()
    if (ok !== mqttData.mqttConnected) {
      mqttData.mqttConnected = ok
      if (ok) {
        mqttData.error = ''
        openBackendRelaySocket()
      } else {
        mqttData.error = '后端 MQTT 已断开'
        if (relaySocket) {
          relaySocket.close()
          relaySocket = null
        }
      }
      notifyStateChange()
    }
  }, 5000)

  notifyStateChange()
}

/**
 * 初始化 MQTT 连接
 * @param {(state: typeof mqttData) => void} [onStateChange] 状态变更回调
 */
export function initMqtt(onStateChange) {
  if (USE_BACKEND_RELAY) {
    initBackendRelay(onStateChange)
    return null
  }

  if (client) {
    console.log('[MQTT] 客户端已存在，跳过重复初始化')
    return client
  }

  stateListener = onStateChange ?? null
  mqttData.connecting = true
  mqttData.error = ''
  notifyStateChange()

  const clientId = `dorm-web-${Math.random().toString(16).slice(2, 10)}`
  console.log('[MQTT] 正在连接:', MQTT_CONFIG.brokerUrl)

  client = mqtt.connect(MQTT_CONFIG.brokerUrl, {
    clientId,
    protocolVersion: MQTT_CONFIG.protocolVersion,
    clean: MQTT_CONFIG.clean,
    reconnectPeriod: MQTT_CONFIG.reconnectPeriod,
    connectTimeout: MQTT_CONFIG.connectTimeout,
  })

  client.on('connect', () => {
    mqttData.mqttConnected = true
    mqttData.connecting = false
    mqttData.error = ''
    console.log('[MQTT] 连接成功')
    subscribeTopics()
    notifyStateChange()
  })

  client.on('message', handleMessage)

  client.on('error', (err) => {
    mqttData.error = err.message
    mqttData.connecting = false
    console.error('[MQTT] 连接错误:', err.message)
    notifyStateChange()
  })

  client.on('close', () => {
    mqttData.mqttConnected = false
    mqttData.connecting = false
    console.log('[MQTT] 连接已关闭')
    notifyStateChange()
  })

  client.on('reconnect', () => {
    mqttData.connecting = true
    mqttData.mqttConnected = false
    console.log('[MQTT] 正在重连...')
    notifyStateChange()
  })

  client.on('offline', () => {
    mqttData.mqttConnected = false
    console.warn('[MQTT] 客户端离线')
    notifyStateChange()
  })

  return client
}

async function publishJson(topic, payload) {
  if (USE_BACKEND_RELAY) {
    if (!mqttData.mqttConnected) {
      throw new Error('MQTT 未连接')
    }
    const token = localStorage.getItem('token')
    const res = await fetch('/api/mqtt/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ topic, payload }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || 'MQTT 发布失败')
    }
    const message = JSON.stringify(payload)
    console.log('[MQTT] 已发布(后端中继):', topic, message)
    return { topic, payload }
  }

  if (!client || !mqttData.mqttConnected) {
    throw new Error('MQTT 未连接')
  }
  const message = JSON.stringify(payload)
  client.publish(topic, message, { qos: 1 })
  console.log('[MQTT] 已发布:', topic, message)
  return { topic, payload }
}

/** 门锁命令：unlock | lock */
export function sendLockCommand(cmd) {
  if (cmd !== 'unlock' && cmd !== 'lock') {
    throw new Error(`无效门锁命令: ${cmd}`)
  }
  return publishJson(MQTT_TOPICS.DEVICE1_CMD, { cmd })
}

/** 灯光命令：on | off */
export function sendLightCommand(cmd) {
  if (cmd !== 'on' && cmd !== 'off') {
    throw new Error(`无效灯光命令: ${cmd}`)
  }
  return publishJson(MQTT_TOPICS.DEVICE3_CMD, { cmd })
}

/** 空调命令：ac_on | ac_off */
export function sendAcCommand(cmd) {
  if (cmd !== 'ac_on' && cmd !== 'ac_off') {
    throw new Error(`无效空调命令: ${cmd}`)
  }
  return publishJson(MQTT_TOPICS.DEVICE2_CMD, { cmd })
}

/** 销毁 MQTT 连接 */
export function destroyMqtt() {
  if (healthTimer) {
    clearInterval(healthTimer)
    healthTimer = null
  }

  if (relaySocket) {
    relaySocket.close()
    relaySocket = null
  }

  if (client) {
    client.end(true)
    client = null
  }

  mqttData.mqttConnected = false
  mqttData.connecting = false
  stateListener = null
  console.log('[MQTT] 连接已销毁')
  notifyStateChange()
}

export function getMqttClient() {
  return client
}
