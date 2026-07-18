import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useMqttStore } from '@/stores/mqtt'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    name: 'Main',
    meta: { requiresAuth: true },
    component: { template: '<div />' },
  },
  {
    path: '/dashboard',
    redirect: '/',
  },
  {
    path: '/control',
    redirect: '/',
  },
  {
    path: '/logs',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }

  if (to.name === 'Login' && authStore.isLoggedIn) {
    return { name: 'Main' }
  }

  if (authStore.isLoggedIn && to.name !== 'Login') {
    const mqttStore = useMqttStore()
    if (!mqttStore.connected && !mqttStore.connecting) {
      mqttStore.connect()
    }
  }
})

export default router
