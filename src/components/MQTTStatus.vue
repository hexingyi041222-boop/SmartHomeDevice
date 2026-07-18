<template>
  <div class="mqtt-status">
    <span class="dot" :class="statusClass" />
    <span class="label">{{ statusText }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useMqttStore } from '@/stores/mqtt'

const mqttStore = useMqttStore()

const statusClass = computed(() => {
  if (mqttStore.connected) return 'online'
  if (mqttStore.connecting) return 'connecting'
  return 'offline'
})

const statusText = computed(() => {
  if (mqttStore.connected) return 'MQTT 已连接'
  if (mqttStore.connecting) return 'MQTT 连接中...'
  return 'MQTT 未连接'
})
</script>

<style scoped>
.mqtt-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 999px;
  background: var(--lg-glass-bg-strong);
  border: 1px solid var(--lg-glass-line);
  font-size: 12px;
  color: var(--lg-text-muted);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot.online {
  background: #5ecbd6;
  box-shadow: 0 0 8px rgba(94, 203, 214, 0.6);
}

.dot.connecting {
  background: #f5a623;
  animation: pulse 1s infinite;
}

.dot.offline {
  background: #f07178;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
</style>
