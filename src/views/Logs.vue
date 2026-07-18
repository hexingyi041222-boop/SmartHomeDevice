<template>
  <div class="logs-panel glass-card">
    <div class="glass-card__header">
      <div class="glass-card__title">
        <div class="glass-card__title-icon">
          <el-icon><Document /></el-icon>
        </div>
        <span>操作日志</span>
      </div>
      <div class="header-actions">
        <el-select
          v-model="filterDevice"
          placeholder="筛选设备"
          clearable
          size="small"
          style="width: 130px"
        >
          <el-option label="系统/登录" value="system" />
          <el-option label="照明" value="light" />
          <el-option label="门禁" value="door" />
          <el-option label="空调" value="ac" />
        </el-select>
        <el-button size="small" round :loading="loading" @click="loadLogs">刷新</el-button>
      </div>
    </div>

    <div class="glass-card__body logs-body">
      <el-table
        :data="filteredLogs"
        v-loading="loading"
        class="glass-table"
        size="small"
        height="100%"
        stripe
      >
        <el-table-column prop="device_type" label="设备类型" width="90">
          <template #default="{ row }">
            <el-tag size="small" round effect="light">
              {{ deviceLabels[row.device_type] || row.device_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="操作" width="80" />
        <el-table-column prop="operator" label="操作人" width="80" />
        <el-table-column prop="timestamp" label="时间" min-width="140">
          <template #default="{ row }">
            {{ formatTime(row.timestamp) }}
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { getLogs } from '@/api'

const logs = ref([])
const loading = ref(false)
const filterDevice = ref('')

const deviceLabels = {
  system: '系统',
  light: '照明',
  door: '门禁',
  ac: '空调',
}

const filteredLogs = computed(() => {
  if (!filterDevice.value) return logs.value
  return logs.value.filter((log) => log.device_type === filterDevice.value)
})

function formatTime(time) {
  return new Date(time).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

async function loadLogs() {
  loading.value = true
  try {
    const data = await getLogs({ limit: 200 })
    logs.value = data.logs || []
  } finally {
    loading.value = false
  }
}

defineExpose({ loadLogs })

onMounted(loadLogs)
</script>

<style scoped>
.logs-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.logs-panel:hover {
  transform: translateY(-4px);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logs-body {
  flex: 1;
  min-height: 0;
  padding-top: 8px;
}
</style>
