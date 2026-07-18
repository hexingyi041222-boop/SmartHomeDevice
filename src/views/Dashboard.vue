<template>
  <div class="spacethiq-dashboard">
    <!-- 全屏 3D 背景层 -->
    <div class="scene-bg">
      <HouseScene3D
        :model-path="modelPath"
        :light-on="isLightOn"
        :door-open="isDoorOpen"
        :ac-on="acOn"
      />
    </div>

    <!-- UI 悬浮层（中间空白区域可穿透操作 3D 场景） -->
    <div class="dashboard-ui">
      <header class="header-wrap">
        <div class="page-header float-panel">
          <div class="page-header__titles">
            <h1 class="page-title">Smart Home Control</h1>
            <p class="page-subtitle">Hi3861 · 实时监控中</p>
          </div>
          <div
            class="system-badge"
            :class="mqttStore.connected ? 'system-badge--on' : 'system-badge--off'"
          >
            <span class="system-badge__dot" />
            <span>{{ mqttStore.connected ? '系统在线' : '系统离线' }}</span>
          </div>
        </div>
      </header>

      <div class="dashboard-body">
        <LifeAssistantCard />

        <main class="main-panel">
          <div class="main-spacer" aria-hidden="true" />
        </main>

        <aside class="right-panel float-panel">
          <div class="welcome-card">
            <p class="welcome-sub">欢迎回来</p>
            <h2 class="welcome-name" @click="handleLogout" title="点击退出登录">
              Hey, {{ authStore.username }}!
            </h2>

            <div
              class="metrics-grid"
              :class="{ 'metrics-grid--pulse': envPulse }"
            >
              <div class="metric-cell metric-cell--temp">
                <div class="metric-cell__head">
                  <el-icon :size="14"><Sunny /></el-icon>
                  <span>温度</span>
                </div>
                <span class="metric-num">{{ fmt(displayTemperature) }}°C</span>
              </div>
              <div class="metric-cell metric-cell--humidity">
                <div class="metric-cell__head">
                  <el-icon :size="14"><Drizzling /></el-icon>
                  <span>湿度</span>
                </div>
                <span class="metric-num">{{ fmt(displayHumidity) }}%</span>
              </div>
              <div class="metric-cell metric-cell--mqtt">
                <div class="metric-cell__head">
                  <el-icon :size="14"><Connection /></el-icon>
                  <span>MQTT</span>
                  <span
                    class="metric-mqtt-dot"
                    :class="mqttStore.connected ? 'on' : 'off'"
                  />
                </div>
                <span class="metric-num">
                  {{ mqttStore.connected ? '在线' : '离线' }}
                </span>
              </div>
            </div>
          </div>

          <div class="logs-card">
            <div class="logs-card__header">
              <h3 class="logs-title">操作日志</h3>
              <div class="logs-filter">
                <span>全部</span>
                <el-icon :size="11"><ArrowDown /></el-icon>
              </div>
            </div>
            <ul v-if="recentLogs.length" class="logs-list">
              <li
                v-for="log in recentLogs"
                :key="log.id"
                class="log-row"
              >
                <div
                  class="log-icon-wrap"
                  :class="`log-icon-wrap--${log.device_type}`"
                >
                  <el-icon :size="15">
                    <Lock v-if="log.device_type === 'door'" />
                    <WindPower v-else-if="log.device_type === 'ac'" />
                    <Sunny v-else-if="log.device_type === 'light'" />
                    <Setting v-else />
                  </el-icon>
                </div>
                <div class="log-content">
                  <div class="log-action-line">
                    <span class="log-device">
                      {{ deviceLabels[log.device_type] || log.device_type }}
                    </span>
                    <span
                      class="log-badge"
                      :class="{
                        'log-badge--active': ['on', 'open', '开启'].includes(log.action),
                        'log-badge--inactive': ['off', 'close', '锁定', '关闭'].includes(log.action),
                      }"
                    >
                      {{ log.action }}
                    </span>
                  </div>
                  <p class="log-operator">{{ log.operator }}</p>
                </div>
                <div class="log-time-wrap">
                  <el-icon :size="11"><Clock /></el-icon>
                  <span class="log-time">{{ formatTimeShort(log.timestamp) }}</span>
                </div>
              </li>
            </ul>
            <p v-else class="logs-empty">暂无记录</p>
          </div>

          <section class="device-stack">
            <div class="device-card">
              <div class="device-card__main">
                <div
                  class="device-card__icon"
                  :class="isLightOn ? 'device-card__icon--green' : 'device-card__icon--neutral'"
                >
                  <el-icon :size="22"><Sunny /></el-icon>
                </div>
                <div class="device-card__info">
                  <p class="device-card__name">照明</p>
                  <p class="device-card__desc">客厅主灯</p>
                </div>
                <el-switch
                  v-model="isLightOn"
                  class="figma-switch"
                  :class="{ 'figma-switch--on': isLightOn }"
                  @change="handleLightSwitch"
                />
              </div>
            </div>

            <div class="device-card">
              <div class="device-card__main">
                <div
                  class="device-card__icon"
                  :class="acOn ? 'device-card__icon--green' : 'device-card__icon--neutral'"
                >
                  <el-icon :size="22"><WindPower /></el-icon>
                </div>
                <div class="device-card__info">
                  <p class="device-card__name">空调</p>
                  <p class="device-card__desc">客厅空调</p>
                </div>
                <el-switch
                  v-model="acOn"
                  class="figma-switch"
                  @change="handleAC"
                />
              </div>
            </div>

            <div class="device-card">
              <div class="device-card__main">
                <div class="device-card__icon device-card__icon--blue">
                  <el-icon :size="22"><Lock /></el-icon>
                </div>
                <div class="device-card__info">
                  <p class="device-card__name">门锁</p>
                  <p class="device-card__desc">大门锁</p>
                </div>
                <el-button
                  class="door-open-btn"
                  :class="{ 'door-open-btn--close': isDoorOpen }"
                  :type="isDoorOpen ? 'danger' : 'primary'"
                  round
                  size="small"
                  :loading="doorLoading"
                  @click="handleOpenDoor"
                >
                  <el-icon><Unlock v-if="!isDoorOpen" /><Lock v-else /></el-icon>
                  {{ isDoorOpen ? '关门' : '远程开门' }}
                </el-button>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <footer class="footer-wrap">
        <div class="status-bar float-panel">
          <div
            class="status-left"
            :class="mqttStore.connected ? 'status-left--on' : 'status-left--off'"
          >
            <span class="status-dot" :class="mqttStore.connected ? 'on' : 'off'" />
            <el-icon :size="13" class="status-mqtt-icon"><Connection /></el-icon>
            <span class="status-text">
              {{ mqttStore.connected ? 'MQTT 已连接' : 'MQTT 未连接' }}
            </span>
            <span class="status-broker">{{ mqttBrokerLabel }}</span>
          </div>
          <div class="status-center">
            <el-icon :size="13"><Clock /></el-icon>
            <span>{{ currentTime.slice(0, 5) }}</span>
          </div>
          <div class="status-right">
            <el-icon :size="14"><Sunny /></el-icon>
            <span>{{ guangzhouWeatherCondition }}</span>
            <strong>{{ guangzhouWeatherTemp }}°C</strong>
            <span class="status-city">{{ guangzhouCity }}</span>
          </div>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getSensorLatest, controlDevice, getLogs } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { storeToRefs } from 'pinia'
import { MQTT_CONFIG } from '@/services/mqttService'
import { useMqttStore } from '@/stores/mqtt'
import HouseScene3D from '@/components/HouseScene3D.vue'
import LifeAssistantCard from '@/components/LifeAssistantCard.vue'
import { fetchWeather } from '@/services/weatherService'

const router = useRouter()
const authStore = useAuthStore()
const mqttStore = useMqttStore()
const { temperature: mqttTemperature, humidity: mqttHumidity } = storeToRefs(mqttStore)
const mqttBrokerLabel = import.meta.env.VITE_MQTT_USE_BACKEND !== 'false'
  ? '后端中继 mqtt://192.168.3.45:1883'
  : MQTT_CONFIG.brokerUrl.replace(/^wss?:\/\//, '')

const loadingLatest = ref(false)
const envPulse = ref(false)
const currentTime = ref('')
const activeNav = ref('dashboard')

/** GLB 模型路径（文件放在 public/models/ 下） */
const modelPath = ref('/models/scene.glb')

const latestTemperature = ref(null)
const latestHumidity = ref(null)
const latestLight = ref(null)

/** 3D / UI 共享状态（按钮改状态 → watch 驱动 3D，MQTT 在 handler 中发送） */
const isLightOn = ref(false)
const isDoorOpen = ref(false)

watch(() => mqttStore.lightStatus, (status) => {
  if (status !== null && status !== undefined) {
    isLightOn.value = status === 1
  }
})

watch(() => mqttStore.doorStatus, (status) => {
  if (doorLoading.value) return
  if (status !== null && status !== undefined) {
    isDoorOpen.value = status === 1
  }
})

watch(() => mqttStore.ac, (status) => {
  if (status !== null && status !== undefined) {
    acOn.value = status === 1
  }
})
const pirMode = ref(false)
const lightThreshold = ref(500)
const acOn = ref(false)
const doorLoading = ref(false)

const logs = ref([])

const guangzhouCity = import.meta.env.VITE_WEATHER_CITY || '广州'
const guangzhouWeather = ref(null)

const guangzhouWeatherTemp = computed(() => {
  const t = guangzhouWeather.value?.tempC
  if (t === null || t === undefined || t === '--') return '--'
  const n = Number(t)
  return Number.isNaN(n) ? '--' : n.toFixed(1)
})

const guangzhouWeatherCondition = computed(() =>
  guangzhouWeather.value?.condition || '加载中',
)

let refreshTimer = null
let clockTimer = null
let weatherTimer = null

const navItems = [
  { id: 'dashboard', emoji: '🏠', label: '仪表盘' },
  { id: 'light', emoji: '💡', label: '灯光' },
  { id: 'door', emoji: '🚪', label: '门禁' },
  { id: 'ac', emoji: '🌡️', label: '空调' },
]

const TYPE_MAP = {
  temperature: ['temperature', 'sht30_temp', 'sht30'],
  humidity: ['humidity', 'sht30_humi'],
  light: ['light', 'illuminance', 'bh1750'],
}

const deviceLabels = {
  system: '系统',
  light: '照明',
  door: '门锁',
  ac: '空调',
}

function matchType(recordType, group) {
  return TYPE_MAP[group].some((t) => recordType.includes(t) || t.includes(recordType))
}

function pickFromSensors(sensors, group) {
  const item = sensors?.find((s) => matchType(s.type, group))
  return item?.value ?? null
}

function fmt(val) {
  if (val === null || val === undefined) return '--'
  return Number(val).toFixed(1)
}

const displayTemperature = computed(() => mqttTemperature.value ?? latestTemperature.value)
const displayHumidity = computed(() => mqttHumidity.value ?? latestHumidity.value)
const displayLight = computed(() => mqttStore.illuminance ?? latestLight.value)
const recentLogs = computed(() => logs.value.slice(0, 3))

function logIcon(type) {
  return ({ light: '💡', door: '🚪', ac: '🌡️', system: '⚙️' })[type] || '📋'
}

function updateClock() {
  currentTime.value = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function triggerEnvPulse() {
  envPulse.value = true
  setTimeout(() => { envPulse.value = false }, 600)
}

function handleLogout() {
  authStore.logout()
  router.push({ name: 'Login' })
}

async function loadLatest() {
  loadingLatest.value = true
  try {
    const data = await getSensorLatest()
    const sensors = data.sensors || []
    latestTemperature.value = pickFromSensors(sensors, 'temperature')
    latestHumidity.value = pickFromSensors(sensors, 'humidity')
    latestLight.value = pickFromSensors(sensors, 'light')
    triggerEnvPulse()
  } finally {
    loadingLatest.value = false
  }
}

async function sendControl(device, action, params = {}) {
  // 硬件走 dorm/device* 协议，优先由前端 MQTT 直连下发
  if (mqttStore.connected) {
    await mqttStore.publishControl(device, { action, ...params })
  }

  try {
    await controlDevice({ device, action, params })
  } catch (err) {
    if (!mqttStore.connected) {
      throw err
    }
    console.warn('[API] 后端日志记录失败，MQTT 指令已下发:', err)
  }

  loadLogs()
}

async function handleLightSwitch(val) {
  try {
    await sendControl('light', val ? 'on' : 'off', {
      pir_mode: pirMode.value,
      light_threshold: lightThreshold.value,
    })
    ElMessage.success(`照明已${val ? '开启' : '关闭'}`)
  } catch {
    ElMessage.error('照明控制失败')
    isLightOn.value = !val
  }
}

async function handlePirMode(val) {
  try {
    await sendControl('light', isLightOn.value ? 'on' : 'off', {
      pir_mode: val,
      light_threshold: lightThreshold.value,
    })
    ElMessage.success(`PIR 模式已${val ? '启用' : '禁用'}`)
  } catch {
    ElMessage.error('PIR 模式设置失败')
    pirMode.value = !val
  }
}

async function handleThreshold(val) {
  try {
    await sendControl('light', isLightOn.value ? 'on' : 'off', {
      pir_mode: pirMode.value,
      light_threshold: val,
    })
    ElMessage.success('光照阈值已更新')
  } catch {
    ElMessage.error('阈值设置失败')
  }
}

async function handleOpenDoor() {
  const closing = isDoorOpen.value
  const cmd = closing ? 'lock' : 'unlock'
  console.log('[3D Debug] 门锁指令已触发', { closing, cmd, isDoorOpen: isDoorOpen.value })

  if (!mqttStore.connected) {
    ElMessage.error('MQTT 未连接，无法控制门锁')
    return
  }

  doorLoading.value = true

  try {
    await mqttStore.sendLockCommand(cmd)

    try {
      await controlDevice({ device: 'door', action: closing ? 'close' : 'open' })
    } catch (err) {
      console.warn('[API] 门锁日志记录失败，MQTT 指令已下发:', err)
    }

    isDoorOpen.value = !closing
    ElMessage.success(closing ? '关门指令已发送' : '开门指令已发送')
    loadLogs()
  } catch (err) {
    console.error('[MQTT] 门锁控制失败:', err)
    ElMessage.error(closing ? '关门失败' : '开门失败')
  } finally {
    doorLoading.value = false
  }
}

async function handleAC(val) {
  const cmd = val ? 'ac_on' : 'ac_off'

  if (!mqttStore.connected) {
    ElMessage.error('MQTT 未连接，无法控制空调')
    acOn.value = !val
    return
  }

  try {
    await mqttStore.sendAcCommand(cmd)

    try {
      await controlDevice({ device: 'ac', action: val ? 'on' : 'off' })
    } catch (err) {
      console.warn('[API] 空调日志记录失败，MQTT 指令已下发:', err)
    }

    ElMessage.success(`空调已${val ? '开启' : '关闭'}`)
    loadLogs()
  } catch (err) {
    console.error('[MQTT] 空调控制失败:', err)
    ElMessage.error('空调控制失败')
    acOn.value = !val
  }
}

function toggleLight() {
  isLightOn.value = !isLightOn.value
  handleLightSwitch(isLightOn.value)
}

function toggleAC() {
  acOn.value = !acOn.value
  handleAC(acOn.value)
}

function formatTimeShort(time) {
  return new Date(time).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function loadLogs() {
  try {
    const data = await getLogs({ limit: 200 })
    logs.value = data.logs || []
  } catch {
    /* ignore */
  }
}

async function loadGuangzhouWeather() {
  try {
    guangzhouWeather.value = await fetchWeather(guangzhouCity)
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  loadLatest()
  loadLogs()
  loadGuangzhouWeather()
  updateClock()
  clockTimer = setInterval(updateClock, 1000)
  refreshTimer = setInterval(loadLatest, 30000)
  weatherTimer = setInterval(loadGuangzhouWeather, 30 * 60 * 1000)
})

onUnmounted(() => {
  clearInterval(refreshTimer)
  clearInterval(clockTimer)
  clearInterval(weatherTimer)
})
</script>

<style scoped>
/* 全屏 3D 背景 + UI 悬浮层 */
.spacethiq-dashboard {
  --figma-text: #ffffff;
  --figma-text-secondary: #ffffff;
  --figma-text-muted: #ffffff;
  --figma-text-light: #ffffff;
  --figma-text-faint: #ffffff;
  --figma-green: #10b981;
  --figma-blue: #3b82f6;
  --figma-gutter: 12px;
  --float-bg: rgba(255, 255, 255, 0.2);
  --float-blur: blur(12px);
  --float-radius: 16px;

  position: relative;
  width: 100%;
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
  margin: 0;
  padding: 0;
  background: #e8e8e8;
  color: var(--figma-text);
  font-family: Inter, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

/* 3D 全屏背景 */
.scene-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
}

.scene-bg :deep(.house-scene) {
  width: 100%;
  height: 100%;
  min-height: 100%;
}

/* UI 悬浮层 */
.dashboard-ui {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  pointer-events: none;
  color: #ffffff;
}

.dashboard-ui .float-panel,
.dashboard-ui .page-header,
.dashboard-ui .header-wrap,
.dashboard-ui .right-panel,
.dashboard-ui .life-assistant-column,
.dashboard-ui .life-assistant-weather,
.dashboard-ui .life-assistant-chat,
.dashboard-ui .footer-wrap,
.dashboard-ui .status-bar,
.dashboard-ui .device-stack,
.dashboard-ui .device-card,
.dashboard-ui .welcome-card,
.dashboard-ui .logs-card {
  pointer-events: auto;
}

.dashboard-ui :deep(.el-icon) {
  color: #ffffff;
}

.float-panel {
  background: var(--float-bg);
  backdrop-filter: var(--float-blur);
  -webkit-backdrop-filter: var(--float-blur);
  border-radius: var(--float-radius);
  overflow: hidden;
}

.dashboard-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
  padding: 0 var(--figma-gutter);
  gap: var(--figma-gutter);
}

/* 顶部标题栏：与底部状态栏同宽 */
.header-wrap {
  flex-shrink: 0;
  padding: var(--figma-gutter);
}

.header-wrap .page-header {
  width: 100%;
}

.main-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.main-spacer {
  flex: 1;
  min-height: 0;
  pointer-events: none;
}

/* [FIGMA] 页头 */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 10px 14px;
}

.page-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  line-height: 28.6px;
  color: var(--figma-text);
}

.page-subtitle {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--figma-text-secondary);
}

.system-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 13px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}

.system-badge--on {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.18);
  color: #ffffff;
}

.system-badge--off {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.18);
  color: #ffffff;
}

.system-badge__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

/* 右侧栏设备控制（垂直排列） */
.device-stack {
  flex-shrink: 0;
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
}

.device-card {
  border-radius: var(--float-radius);
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.device-card__main {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}

.device-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.device-card__icon--neutral {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.device-card__icon--green {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.device-card__icon--blue {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.device-card__info {
  flex: 1;
  min-width: 0;
}

.device-card__name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 22.5px;
  color: var(--figma-text);
}

.device-card__desc {
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
  color: var(--figma-text-secondary);
}

.door-open-btn {
  flex-shrink: 0;
  background: var(--figma-blue);
  border-color: var(--figma-blue);
}

.door-open-btn--close {
  background: #ef4444;
  border-color: #ef4444;
}

/* [FIGMA] Element Plus 开关配色 */
.figma-switch:deep(.el-switch__core) {
  min-width: 44px;
  height: 24px;
  border-radius: 12px;
  background: #cbd5e1;
  border: none;
}

.figma-switch:deep(.el-switch.is-checked .el-switch__core) {
  background: var(--figma-blue);
}

.figma-switch:deep(.el-switch__action) {
  width: 18px;
  height: 18px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
}

/* 右侧栏 */
.right-panel {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  overflow: hidden;
  padding: 12px;
}

.welcome-card {
  padding: 0 0 var(--figma-gutter);
  flex-shrink: 0;
}

.welcome-sub {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--figma-text-secondary);
  background: transparent;
}

.welcome-name {
  margin: 2px 0 0;
  font-size: 24px;
  font-weight: 600;
  line-height: 28.8px;
  color: var(--figma-text);
  cursor: pointer;
}

.welcome-name:hover {
  color: #ffffff;
  opacity: 0.85;
}

/* [FIGMA] 彩色传感器网格 */
.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
}

.metrics-grid--pulse {
  animation: figma-pulse 0.6s ease;
}

@keyframes figma-pulse {
  50% { opacity: 0.7; transform: scale(0.98); }
}

.metric-cell {
  padding: 10px 12px;
  border-radius: var(--float-radius);
  overflow: hidden;
}

.metric-cell--temp {
  background: rgba(251, 191, 36, 0.1);
}

.metric-cell--humidity {
  background: rgba(59, 130, 246, 0.08);
}

.metric-cell--mqtt {
  background: rgba(16, 185, 129, 0.1);
}

.metric-cell__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--figma-text-secondary);
}

.metric-mqtt-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-left: auto;
}

.metric-mqtt-dot.on {
  background: var(--figma-green);
}

.metric-mqtt-dot.off {
  background: #ef4444;
}

.metric-num {
  display: block;
  font-size: 22px;
  font-weight: 700;
  line-height: 22px;
  color: var(--figma-text);
}

/* [FIGMA] 操作日志卡片 */
.logs-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 0 0;
  overflow: hidden;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  margin-top: 12px;
}

.logs-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
  flex-shrink: 0;
}

.logs-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--figma-text);
}

.logs-filter {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 0;
  background: rgba(0, 0, 0, 0.04);
  font-size: 11px;
  color: var(--figma-text-secondary);
}

.logs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.log-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-radius: 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.log-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.log-icon-wrap--door,
.log-icon-wrap--system {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.log-icon-wrap--ac,
.log-icon-wrap--light {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.log-content {
  flex: 1;
  min-width: 0;
}

.log-action-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.log-device {
  font-size: 13px;
  font-weight: 500;
  color: var(--figma-text);
}

.log-badge {
  padding: 0 6px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
}

.log-badge--active {
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
}

.log-badge--inactive {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.log-operator {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--figma-text-light);
}

.log-time-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  color: var(--figma-text-muted);
}

.log-time {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.logs-empty {
  margin: 0;
  font-size: 12px;
  color: var(--figma-text-secondary);
  text-align: center;
  padding: 16px 0;
}

/* 底部状态栏：悬浮模块，与内容区及页面底边留间距 */
.footer-wrap {
  flex-shrink: 0;
  padding: var(--figma-gutter);
}

.footer-wrap .status-bar,
.header-wrap .page-header {
  width: 100%;
}

.status-bar {
  height: 44px;
  padding: 0 14px;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.status-left,
.status-center,
.status-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.on {
  background: var(--figma-green);
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
}

.status-dot.off {
  background: #ef4444;
}

.status-left--on {
  color: var(--figma-green);
}

.status-left--on .status-broker,
.status-left--on .status-text {
  color: var(--figma-green);
}

.status-left--on :deep(.el-icon) {
  color: var(--figma-green);
}

.status-left--off {
  color: #ef4444;
}

.status-left--off .status-broker,
.status-left--off .status-text {
  color: #ef4444;
}

.status-left--off :deep(.el-icon) {
  color: #ef4444;
}

.status-text {
  font-weight: 500;
}

.status-broker {
  font-size: 11px;
}

.status-center {
  font-size: 14px;
  font-weight: 700;
  color: var(--figma-text);
  font-variant-numeric: tabular-nums;
}

.status-right {
  color: var(--figma-text-secondary);
}

.status-right strong {
  color: var(--figma-text);
  font-size: 13px;
}

.status-city {
  color: var(--figma-text-faint);
  font-size: 11px;
}

@media (max-width: 1200px) {
  .right-panel {
    width: 280px;
  }
}
</style>
