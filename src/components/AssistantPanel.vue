<template>
  <div class="assistant-root">
    <button
      v-show="!expanded"
      type="button"
      class="assistant-fab"
      title="打开操作助理"
      @click="expanded = true"
    >
      <el-icon :size="22"><ChatDotRound /></el-icon>
      <span v-if="hasUnread" class="assistant-fab__dot" />
    </button>

    <Transition name="assistant-slide">
      <div v-show="expanded" class="assistant-panel">
        <header class="assistant-panel__head">
          <div class="assistant-panel__title">
            <el-icon :size="16"><Monitor /></el-icon>
            <span>操作助理</span>
            <span v-if="offlineMode" class="assistant-badge">离线模式</span>
          </div>
          <div class="assistant-panel__actions">
            <button type="button" class="assistant-icon-btn" title="健康检查" @click="runHealthCheck">
              <el-icon :size="14"><Setting /></el-icon>
            </button>
            <button type="button" class="assistant-icon-btn" title="状态摘要" @click="runSummary">
              <el-icon :size="14"><DataLine /></el-icon>
            </button>
            <button type="button" class="assistant-icon-btn" title="收起" @click="expanded = false">
              <el-icon :size="14"><ArrowDown /></el-icon>
            </button>
          </div>
        </header>

        <div ref="logRef" class="assistant-panel__log">
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="assistant-msg"
            :class="`assistant-msg--${msg.role}`"
          >
            <span class="assistant-msg__time">{{ msg.timeLabel }}</span>
            <pre class="assistant-msg__body">{{ msg.text }}</pre>
          </div>
          <p v-if="!messages.length" class="assistant-empty">控制台就绪 · 输入指令或点击日志获取解释</p>
        </div>

        <form class="assistant-panel__input" @submit.prevent="handleSend">
          <input
            v-model="inputText"
            type="text"
            class="assistant-input"
            placeholder="输入指令，如：关灯 / 健康检查 / 状态摘要"
            :disabled="sending"
          />
          <button type="submit" class="assistant-send" :disabled="sending || !inputText.trim()">
            {{ sending ? '…' : '发送' }}
          </button>
        </form>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import {
  ArrowDown,
  ChatDotRound,
  DataLine,
  Monitor,
  Setting,
} from '@element-plus/icons-vue'
import {
  buildHealthSummary,
  buildStatusSummary,
  checkEnvAnomaly,
  explainLogLocally,
  resolveAssistantIntent,
  resolveDeviceKey,
  resolveLogExplanation,
} from '@/services/assistantService'

const props = defineProps({
  getContext: {
    type: Function,
    required: true,
  },
  onExecuteDevice: {
    type: Function,
    required: true,
  },
})

const MAX_MESSAGES = 10

const expanded = ref(false)
const offlineMode = ref(false)
const sending = ref(false)
const inputText = ref('')
const messages = ref([])
const hasUnread = ref(false)
const logRef = ref(null)
const announcedAlerts = ref(new Set())
const pendingCommands = ref([])

function nowLabel() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function pushMessage(role, text, { forceShow = false } = {}) {
  messages.value.push({
    id: `${Date.now()}-${Math.random()}`,
    role,
    text,
    timeLabel: nowLabel(),
  })
  if (messages.value.length > MAX_MESSAGES) {
    messages.value.shift()
  }
  if (!expanded.value && forceShow) {
    hasUnread.value = true
  }
  nextTick(() => {
    if (logRef.value) {
      logRef.value.scrollTop = logRef.value.scrollHeight
    }
  })
}

function setOfflineFlag(flag) {
  offlineMode.value = flag
}

async function executeDeviceAction(result) {
  const device = result.device || resolveDeviceKey(result.target)
  if (!device) {
    pushMessage('system', `未找到设备：${result.target || '未知'}`)
    return false
  }

  const ctx = props.getContext()
  if (!ctx.mqttConnected) {
    pendingCommands.value.push({ ...result, device })
    pushMessage('system', '⚠️ 当前离线，指令已记录，上线后将尝试执行')
    return false
  }

  try {
    await props.onExecuteDevice({
      device,
      command: result.command,
      temp: result.temp,
    })
    pushMessage('assistant', `✅ 已执行：${result.response}`)
    return true
  } catch (err) {
    pushMessage('system', `❌ 执行失败：${err?.message || '设备无响应，请检查连接'}`)
    return false
  }
}

async function handleParsedResult(result, fromOffline) {
  if (fromOffline) setOfflineFlag(true)
  else setOfflineFlag(false)

  if (!result?.response && result?.action !== 'device') {
    pushMessage('system', '助手未能理解该请求')
    return
  }

  switch (result.action) {
    case 'device':
      await executeDeviceAction(result)
      break
    case 'health':
      pushMessage('assistant', buildHealthSummary(props.getContext()))
      break
    case 'summary':
      pushMessage('assistant', buildStatusSummary(props.getContext()))
      break
    case 'explain':
      pushMessage('assistant', result.response)
      break
    case 'reject':
      pushMessage('assistant', result.response)
      break
    default:
      if (result.response) pushMessage('assistant', result.response)
      break
  }
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || sending.value) return
  pushMessage('user', text)
  inputText.value = ''
  sending.value = true
  try {
    const { result, offlineMode: isOffline } = await resolveAssistantIntent(text, props.getContext())
    if (isOffline) {
      pushMessage('system', '助手离线模式 - 使用本地规则')
    }
    await handleParsedResult(result, isOffline)
  } finally {
    sending.value = false
  }
}

async function runHealthCheck() {
  expanded.value = true
  hasUnread.value = false
  pushMessage('user', '健康检查')
  pushMessage('assistant', buildHealthSummary(props.getContext()))
}

async function runSummary() {
  expanded.value = true
  hasUnread.value = false
  pushMessage('user', '状态摘要')
  pushMessage('assistant', buildStatusSummary(props.getContext()))
}

async function explainLog(log) {
  expanded.value = true
  hasUnread.value = false
  const ctx = props.getContext()
  const labels = ctx.deviceLabels || {}
  const preview = `${labels[log.device_type] || log.device_type} ${log.action} ${log.operator}`
  pushMessage('user', `解释日志：${preview}`)

  sending.value = true
  try {
    const { result, offlineMode: isOffline } = await resolveLogExplanation(log, ctx, labels)
    if (isOffline) pushMessage('system', '助手离线模式 - 使用本地规则')
    await handleParsedResult(result, isOffline)
  } catch {
    await handleParsedResult(explainLogLocally(log, labels), true)
  } finally {
    sending.value = false
  }
}

function announceOnce(key, text) {
  if (announcedAlerts.value.has(key)) return
  announcedAlerts.value.add(key)
  pushMessage('system', text, { forceShow: true })
}

function flushPendingCommands() {
  if (!props.getContext().mqttConnected || !pendingCommands.value.length) return
  const queue = [...pendingCommands.value]
  pendingCommands.value = []
  queue.forEach((cmd) => {
    executeDeviceAction(cmd)
  })
}

watch(expanded, (val) => {
  if (val) hasUnread.value = false
})

watch(
  () => props.getContext(),
  (ctx) => {
    if (!ctx.mqttConnected) {
      announceOnce('mqtt-off', '⚠️ MQTT 已离线，请检查中继服务')
    } else {
      announcedAlerts.value.delete('mqtt-off')
      flushPendingCommands()
    }

    const envAlerts = checkEnvAnomaly(ctx.temperature, ctx.humidity)
    envAlerts.forEach((alert, i) => {
      announceOnce(`env-${i}-${alert}`, alert)
    })

    if (ctx.mqttConnected && ctx.deviceStale) {
      announceOnce('device-stale', '⚠️ 设备长时间无响应，建议检查 MQTT 中继或硬件连接')
    }
  },
  { deep: true, immediate: true },
)

onMounted(() => {
  pushMessage('system', buildStatusSummary(props.getContext()))
})

defineExpose({
  explainLog,
  pushMessage,
  runHealthCheck,
  runSummary,
})
</script>

<style scoped>
.assistant-root {
  position: fixed;
  right: 16px;
  bottom: 72px;
  z-index: 20;
  pointer-events: auto;
  font-family: 'JetBrains Mono', 'Cascadia Code', Consolas, 'PingFang SC', monospace;
}

.assistant-fab {
  width: 52px;
  height: 52px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  color: #e2e8f0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  transition: transform 0.2s ease, background 0.2s ease;
}

.assistant-fab:hover {
  transform: scale(1.05);
  background: rgba(30, 41, 59, 0.85);
}

.assistant-fab__dot {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f87171;
}

.assistant-panel {
  width: min(380px, calc(100vw - 32px));
  height: 420px;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(15, 23, 42, 0.78);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.assistant-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.assistant-panel__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
}

.assistant-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(248, 113, 113, 0.2);
  color: #fca5a5;
}

.assistant-panel__actions {
  display: flex;
  gap: 4px;
}

.assistant-icon-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: #cbd5e1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.assistant-icon-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.assistant-panel__log {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.assistant-msg {
  font-size: 12px;
  line-height: 1.5;
}

.assistant-msg__time {
  display: block;
  font-size: 10px;
  color: rgba(148, 163, 184, 0.85);
  margin-bottom: 2px;
}

.assistant-msg__body {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}

.assistant-msg--user .assistant-msg__body {
  color: #93c5fd;
}

.assistant-msg--assistant .assistant-msg__body {
  color: #e2e8f0;
}

.assistant-msg--system .assistant-msg__body {
  color: #fcd34d;
}

.assistant-empty {
  margin: auto 0;
  text-align: center;
  font-size: 12px;
  color: rgba(148, 163, 184, 0.7);
}

.assistant-panel__input {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.assistant-input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  color: #f8fafc;
  font-size: 12px;
  font-family: inherit;
  outline: none;
}

.assistant-input:focus {
  border-color: rgba(59, 130, 246, 0.5);
}

.assistant-input::placeholder {
  color: rgba(148, 163, 184, 0.6);
}

.assistant-send {
  flex-shrink: 0;
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background: rgba(59, 130, 246, 0.85);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.assistant-send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.assistant-slide-enter-active,
.assistant-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.assistant-slide-enter-from,
.assistant-slide-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}
</style>
