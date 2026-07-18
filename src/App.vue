<template>
  <router-view v-if="isLoginPage" />

  <div v-else class="app-shell">
    <Dashboard />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import Dashboard from '@/views/Dashboard.vue'

const route = useRoute()
const isLoginPage = computed(() => route.name === 'Login')
</script>

<style scoped>
.app-shell {
  width: 100%;
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
  margin: 0;
  padding: 0;
  background: #ffffff;
}
</style>
