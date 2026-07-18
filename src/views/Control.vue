<template>
  <div class="control-panel glass-card">
    <div class="glass-card__header">
      <div class="glass-card__title">
        <div class="glass-card__title-icon">
          <el-icon><Setting /></el-icon>
        </div>
        <span>设备控制</span>
      </div>
    </div>

    <div class="glass-card__body control-body">
      <!-- 照明 -->
      <div class="control-block">
        <div class="block-label">
          <el-icon><Sunny /></el-icon>
          <span>照明</span>
        </div>
        <div class="control-row">
          <span class="row-label">开关</span>
          <el-switch v-model="lightOn" @change="handleLightSwitch" />
        </div>
        <div class="control-row">
          <span class="row-label">PIR 模式</span>
          <el-switch v-model="pirMode" @change="handlePirMode" />
        </div>
        <div class="control-row control-row--slider">
          <span class="row-label">光照阈值</span>
          <el-slider
            v-model="lightThreshold"
            :min="0"
            :max="2000"
            :step="50"
            @change="handleThreshold"
          />
        </div>
      </div>

      <div class="divider" />

      <!-- 门禁 -->
      <div class="control-block">
        <div class="block-label">
          <el-icon><Key /></el-icon>
          <span>门禁</span>
        </div>
        <div class="door-area">
          <div class="door-status" :class="doorLocked ? 'locked' : 'open'">
            <span class="status-dot" />
            {{ doorLocked ? '门已锁定' : '门已开启' }}
          </div>
          <el-button
            type="primary"
            round
            :loading="doorLoading"
            class="action-btn"
            @click="handleOpenDoor"
          >
            <el-icon><Unlock /></el-icon>
            远程开门
          </el-button>
        </div>
      </div>

      <div class="divider" />

      <!-- 空调 -->
      <div class="control-block">
        <div class="block-label">
          <el-icon><WindPower /></el-icon>
          <span>空调模拟</span>
        </div>
        <div class="control-row">
          <span class="row-label">运行状态</span>
          <el-switch
            v-model="acOn"
            inline-prompt
            active-text="开"
            inactive-text="关"
            @change="handleAC"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { controlDevice } from '@/api'
import { useMqttStore } from '@/stores/mqtt'

const emit = defineEmits(['action-done'])

const mqttStore = useMqttStore()

const lightOn = ref(false)
const pirMode = ref(false)
const lightThreshold = ref(500)
const doorLocked = ref(true)
const acOn = ref(false)
const doorLoading = ref(false)

async function sendControl(device, action, params = {}) {
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

  emit('action-done')
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
    lightOn.value = !val
  }
}

async function handlePirMode(val) {
  try {
    await sendControl('light', lightOn.value ? 'on' : 'off', {
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
    await sendControl('light', lightOn.value ? 'on' : 'off', {
      pir_mode: pirMode.value,
      light_threshold: val,
    })
    ElMessage.success('光照阈值已更新')
  } catch {
    ElMessage.error('阈值设置失败')
  }
}

async function handleOpenDoor() {
  doorLoading.value = true
  try {
    await sendControl('door', 'open')
    doorLocked.value = false
    ElMessage.success('开门指令已发送')
    setTimeout(() => { doorLocked.value = true }, 5000)
  } catch {
    ElMessage.error('开门失败')
  } finally {
    doorLoading.value = false
  }
}

async function handleAC(val) {
  if (!mqttStore.connected) {
    ElMessage.error('MQTT 未连接，无法控制空调')
    acOn.value = !val
    return
  }

  try {
    await mqttStore.sendAcCommand(val ? 'ac_on' : 'ac_off')

    try {
      await controlDevice({ device: 'ac', action: val ? 'on' : 'off' })
    } catch (err) {
      console.warn('[API] 空调日志记录失败，MQTT 指令已下发:', err)
    }

    ElMessage.success(`空调已${val ? '开启' : '关闭'}`)
    emit('action-done')
  } catch (err) {
    console.error('[MQTT] 空调控制失败:', err)
    ElMessage.error('空调控制失败')
    acOn.value = !val
  }
}
</script>

<style scoped>
.control-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.control-panel:hover {
  transform: translateY(-4px);
}

.control-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-block {
  padding: 4px 0;
}

.block-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.control-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.control-row--slider {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}

.row-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(226, 232, 240, 0.9), transparent);
  margin: 8px 0;
}

.door-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 8px 0;
}

.door-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
}

.door-status.locked {
  background: rgba(244, 63, 94, 0.1);
  color: #e11d48;
}

.door-status.open {
  background: rgba(34, 197, 94, 0.1);
  color: #16a34a;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 8px currentColor;
}

.action-btn {
  width: 100%;
  max-width: 220px;
}
</style>
