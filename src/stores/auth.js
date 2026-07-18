import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loginApi } from '@/api'
import { useMqttStore } from '@/stores/mqtt'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const username = ref(localStorage.getItem('username') || '')

  const isLoggedIn = computed(() => !!token.value)

  async function login(user, password) {
    const data = await loginApi(user, password)
    token.value = data.access_token
    username.value = user
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('username', user)

    const mqttStore = useMqttStore()
    mqttStore.connect()
  }

  function logout() {
    token.value = ''
    username.value = ''
    localStorage.removeItem('token')
    localStorage.removeItem('username')

    const mqttStore = useMqttStore()
    mqttStore.disconnect()
  }

  return { token, username, isLoggedIn, login, logout }
})
