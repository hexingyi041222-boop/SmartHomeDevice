<template>
  <div class="sensor-card glass-card" :class="`sensor-card--${accent}`">
    <div class="sensor-card__glow" />
    <div class="content">
      <div class="info">
        <p class="title">{{ title }}</p>
        <p class="value">
          {{ displayValue }}
          <span class="unit">{{ unit }}</span>
        </p>
      </div>
      <div class="icon-wrap">
        <el-icon :size="28">
          <component :is="icon" />
        </el-icon>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  value: { type: [Number, null], default: null },
  unit: { type: String, default: '' },
  icon: { type: String, default: 'Odometer' },
  accent: { type: String, default: 'blue' },
})

const displayValue = computed(() => {
  if (props.value === null || props.value === undefined) return '--'
  return Number(props.value).toFixed(1)
})
</script>

<style scoped>
.sensor-card {
  position: relative;
  padding: 16px 18px;
  overflow: hidden;
  min-height: 96px;
}

.sensor-card:hover {
  transform: translateY(-3px);
}

.sensor-card__glow {
  position: absolute;
  top: -20px;
  right: -20px;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  opacity: 0.35;
  filter: blur(24px);
}

.sensor-card--rose .sensor-card__glow { background: #f43f5e; }
.sensor-card--blue .sensor-card__glow { background: #3b82f6; }
.sensor-card--amber .sensor-card__glow { background: #f59e0b; }

.sensor-card--rose .icon-wrap { color: #f43f5e; background: rgba(244, 63, 94, 0.12); }
.sensor-card--blue .icon-wrap { color: #3b82f6; background: rgba(59, 130, 246, 0.12); }
.sensor-card--amber .icon-wrap { color: #f59e0b; background: rgba(245, 158, 11, 0.12); }

.content {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
}

.value {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.unit {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-left: 2px;
}

.icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
}
</style>
