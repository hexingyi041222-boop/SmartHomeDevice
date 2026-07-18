<template>
  <div class="login-page">
    <div ref="vantaRef" class="vanta-bg" aria-hidden="true" />

    <div class="login-card lg-glass">
      <div class="login-brand">
        <div class="brand-icon">
          <el-icon :size="28"><HomeFilled /></el-icon>
        </div>
        <h2>智能家居控制面板</h2>
        <p class="subtitle">Vue 3 · MQTT · Hi3861</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="0"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="用户名"
            prefix-icon="User"
            size="large"
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            prefix-icon="Lock"
            size="large"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-button
          type="primary"
          size="large"
          round
          :loading="loading"
          class="login-btn"
          @click="handleLogin"
        >
          进入控制面板
        </el-button>
      </el-form>

      <p class="hint">默认账号: admin / admin123</p>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const formRef = ref()
const loading = ref(false)
const vantaRef = ref(null)
let vantaEffect = null

const form = reactive({
  username: 'admin',
  password: 'admin123',
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function initVanta() {
  if (!vantaRef.value) return
  try {
    const [THREE, VANTA] = await Promise.all([
      import('three'),
      import('vanta/dist/vanta.waves.min.js'),
    ])
    vantaEffect = VANTA.default({
      el: vantaRef.value,
      THREE: THREE.default ?? THREE,
      mouseControls: true,
      touchControls: true,
      color: 0xd4e4ff,
      shininess: 35,
      waveHeight: 18,
      waveSpeed: 0.6,
      zoom: 0.85,
      backgroundColor: 0xf5f7ff,
    })
  } catch {
    if (vantaRef.value) {
      vantaRef.value.style.background =
        'linear-gradient(135deg, #eef4ff 0%, #f8f0ff 50%, #ffffff 100%)'
    }
  }
}

async function handleLogin() {
  await formRef.value.validate()
  loading.value = true
  try {
    await authStore.login(form.username, form.password)
    ElMessage.success('登录成功')
    router.push(route.query.redirect || '/')
  } catch {
    ElMessage.error('用户名或密码错误')
  } finally {
    loading.value = false
  }
}

onMounted(initVanta)

onBeforeUnmount(() => {
  vantaEffect?.destroy?.()
})
</script>

<style scoped>
.login-page {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

.login-card {
  position: relative;
  z-index: 1;
  width: 420px;
  padding: 36px 32px 28px;
}

.login-brand {
  text-align: center;
  margin-bottom: 28px;
}

.brand-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: linear-gradient(135deg, #5b8def, #9b7ede);
  color: #fff;
  margin-bottom: 16px;
  box-shadow: 0 8px 24px rgba(91, 141, 239, 0.3);
}

h2 {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
  color: var(--lg-text);
}

.subtitle {
  margin: 0;
  color: var(--lg-text-soft);
  font-size: 13px;
}

.login-btn {
  width: 100%;
  margin-top: 8px;
}

.hint {
  margin: 20px 0 0;
  text-align: center;
  color: var(--lg-text-soft);
  font-size: 12px;
}
</style>
