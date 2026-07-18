<template>
  <div class="life-assistant-column">
    <section class="life-assistant-weather float-panel" aria-label="生活小助手天气">
      <header class="life-assistant-weather__head">
        <span class="life-assistant-weather__title">{{ weatherTipTitle }}</span>
      </header>
      <p class="life-assistant-weather__meta">{{ weatherDisplay }}</p>
      <p class="life-assistant-weather__advice">{{ weatherAdvice }}</p>
      <p v-if="weatherNotice" class="life-assistant-weather__notice">{{ weatherNotice }}</p>
    </section>

    <section class="life-assistant-chat float-panel" aria-label="智能助手对话">
      <div ref="chatRef" class="life-assistant-chat__log">
        <div v-if="!hasConversation" class="life-assistant-chat__intro">
          <img
            class="life-assistant-chat__intro-icon"
            :src="assistantIconUrl"
            alt=""
          />
          <p class="life-assistant-chat__intro-text">
            你好，我是智能助手。<br />有问题在下方输入，我们开始聊吧～
          </p>
        </div>
        <template v-else>
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="life-chat-row"
            :class="`life-chat-row--${msg.role}`"
          >
            <div
              class="life-chat-bubble"
              :class="`life-chat-bubble--${msg.role}`"
            >
              <div
                v-if="msg.role === 'assistant'"
                class="life-chat-bubble__body life-chat-bubble__body--md"
                v-html="formatAssistantMessage(msg.text)"
              />
              <div
                v-else-if="msg.role === 'user'"
                class="life-chat-bubble__body"
              >
                {{ msg.text }}
              </div>
              <div v-else class="life-chat-bubble__body life-chat-bubble__body--system">
                {{ msg.text }}
              </div>
            </div>
          </div>
          <div v-if="sending" class="life-chat-row life-chat-row--assistant">
            <div class="life-chat-bubble life-chat-bubble--assistant life-chat-bubble--typing">
              <span class="life-chat-typing-dot" />
              <span class="life-chat-typing-dot" />
              <span class="life-chat-typing-dot" />
            </div>
          </div>
        </template>
      </div>

      <form class="life-assistant-chat__form" @submit.prevent="handleSend">
        <input
          v-model="inputText"
          type="text"
          class="life-assistant-chat__input"
          maxlength="500"
          placeholder="输入问题，开始对话…"
          :disabled="sending"
        />
        <button
          type="submit"
          class="life-assistant-chat__send"
          :disabled="sending || !inputText.trim()"
        >
          发送
        </button>
      </form>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { chatWithLifeAssistant } from '@/services/lifeAssistantService'
import { fetchWeather } from '@/services/weatherService'
import assistantIconUrl from '@/assets/assistant-icon.svg'
import { formatAssistantMessage } from '@/utils/formatChatMessage'

const MAX_MESSAGES = 20
const INPUT_MAX = 500

const weather = ref(null)
const weatherTipTitle = ref('加载中…')
const weatherDisplay = ref('--')
const weatherAdvice = ref('')
const weatherNotice = ref('')

const messages = ref([])
const inputText = ref('')
const sending = ref(false)
const chatRef = ref(null)

const hasConversation = computed(() =>
  messages.value.some((m) => m.role === 'user' || m.role === 'assistant'),
)

function pushMessage(role, text) {
  messages.value.push({
    id: `${Date.now()}-${Math.random()}`,
    role,
    text,
  })
  if (messages.value.length > MAX_MESSAGES) {
    messages.value.shift()
  }
  nextTick(() => {
    if (chatRef.value) {
      chatRef.value.scrollTop = chatRef.value.scrollHeight
    }
  })
}

function applyWeather(w) {
  weather.value = w
  weatherTipTitle.value = `${w.emoji || '🌡️'} ${w.tipTitle || '今日提示'}`
  weatherDisplay.value = `${w.city} ${w.tempC}°C ${w.condition}`
  weatherAdvice.value = w.advice || ''
  if (w.failed || w.fromCache) {
    weatherNotice.value = '天气获取失败，使用上次数据'
  } else {
    weatherNotice.value = ''
  }
}

async function loadWeather() {
  const w = await fetchWeather()
  applyWeather(w)
}

async function handleSend() {
  let text = inputText.value.trim()
  if (!text || sending.value) return
  if (text.length > INPUT_MAX) {
    text = text.slice(0, INPUT_MAX)
  }

  pushMessage('user', text)
  inputText.value = ''
  sending.value = true

  try {
    const history = messages.value
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1)
    const { reply, offline } = await chatWithLifeAssistant(text, weather.value, history)
    if (offline && import.meta.env.VITE_DEEPSEEK_API_KEY) {
      pushMessage('system', '服务暂时不可用，已使用本地简要回复')
    }
    pushMessage('assistant', reply)
  } finally {
    sending.value = false
  }
}

onMounted(() => {
  loadWeather()
})
</script>

<style scoped>
.life-assistant-column {
  --life-text: #ffffff;
  --life-text-soft: rgba(255, 255, 255, 0.88);
  --life-text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55), 0 0 12px rgba(0, 0, 0, 0.25);
  --life-glass-input: rgba(255, 255, 255, 0.16);
  --life-glass-input-focus: rgba(255, 255, 255, 0.24);
  --life-glass-btn: rgba(255, 255, 255, 0.2);
  --life-glass-btn-hover: rgba(255, 255, 255, 0.3);
  --life-panel-bg: rgba(255, 255, 255, 0.2);
  --life-bubble-user: rgba(255, 255, 255, 0.28);
  --life-bubble-assistant: rgba(255, 255, 255, 0.12);

  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--figma-gutter, 12px);
  min-height: 0;
  align-self: stretch;
  pointer-events: auto;
}

.life-assistant-weather,
.life-assistant-chat {
  background: var(--life-panel-bg);
  backdrop-filter: var(--float-blur, blur(12px));
  -webkit-backdrop-filter: var(--float-blur, blur(12px));
  border-radius: var(--float-radius, 16px);
  overflow: hidden;
  width: 100%;
}

.life-assistant-weather {
  flex-shrink: 0;
  padding: 12px 14px;
}

.life-assistant-weather__head {
  margin-bottom: 8px;
}

.life-assistant-weather__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--life-text);
  line-height: 1.4;
  text-shadow: var(--life-text-shadow);
}

.life-assistant-weather__meta {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--life-text);
  text-shadow: var(--life-text-shadow);
}

.life-assistant-weather__advice {
  margin: 0;
  font-size: 14px;
  color: var(--life-text-soft);
  line-height: 1.5;
  text-shadow: var(--life-text-shadow);
}

.life-assistant-weather__notice {
  margin: 6px 0 0;
  font-size: 11px;
  color: #fde68a;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}

.life-assistant-chat {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.life-assistant-chat__log {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.life-assistant-chat__intro {
  margin: auto;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
}

.life-assistant-chat__intro-icon {
  width: 64px;
  height: auto;
  max-height: 42px;
  object-fit: contain;
  display: block;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.4));
}

.life-assistant-chat__intro-text {
  margin: 0;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.55;
  color: var(--life-text-soft);
  text-shadow: var(--life-text-shadow);
  max-width: 220px;
}

.life-assistant-chat__log::-webkit-scrollbar {
  width: 4px;
}

.life-assistant-chat__log::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 4px;
}

.life-chat-row {
  display: flex;
  width: 100%;
}

.life-chat-row--user {
  justify-content: flex-end;
}

.life-chat-row--assistant {
  justify-content: flex-start;
}

.life-chat-row--system {
  justify-content: center;
}

.life-chat-bubble {
  max-width: 92%;
  border-radius: 14px;
  overflow: hidden;
}

.life-chat-bubble--user {
  background: var(--life-bubble-user);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 14px 14px 4px 14px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 2px 10px rgba(0, 0, 0, 0.1);
}

.life-chat-bubble--assistant {
  background: var(--life-bubble-assistant);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 14px 14px 14px 4px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 2px 10px rgba(0, 0, 0, 0.08);
}

.life-chat-bubble--system {
  background: transparent;
  max-width: 100%;
}

.life-chat-bubble__body {
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--life-text);
  text-shadow: var(--life-text-shadow);
  white-space: pre-wrap;
  word-break: break-word;
}

.life-chat-bubble__body--system {
  font-size: 11px;
  color: #fde68a;
  text-align: center;
  white-space: normal;
  padding: 4px 8px;
}

.life-chat-bubble__body--md {
  white-space: normal;
}

.life-chat-bubble__body--md :deep(p) {
  margin: 0 0 8px;
}

.life-chat-bubble__body--md :deep(p:last-child) {
  margin-bottom: 0;
}

.life-chat-bubble__body--md :deep(ul),
.life-chat-bubble__body--md :deep(ol) {
  margin: 0 0 8px;
  padding-left: 1.25em;
}

.life-chat-bubble__body--md :deep(li) {
  margin: 4px 0;
}

.life-chat-bubble__body--md :deep(strong) {
  font-weight: 600;
  color: #fff;
}

.life-chat-bubble__body--md :deep(code) {
  font-family: ui-monospace, monospace;
  font-size: 0.92em;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.2);
}

.life-chat-bubble--typing {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 12px 14px;
}

.life-chat-typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.75);
  animation: life-chat-typing 1.2s infinite ease-in-out;
}

.life-chat-typing-dot:nth-child(2) {
  animation-delay: 0.15s;
}

.life-chat-typing-dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes life-chat-typing {
  0%, 80%, 100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

.life-assistant-chat__form {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 12px;
  flex-shrink: 0;
}

.life-assistant-chat__input {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: none;
  background: var(--life-glass-input);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--life-text);
  font-size: 12px;
  outline: none;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  text-shadow: var(--life-text-shadow);
  transition: background 0.15s ease;
}

.life-assistant-chat__input::placeholder {
  color: rgba(255, 255, 255, 0.72);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.life-assistant-chat__input:focus {
  background: var(--life-glass-input-focus);
}

.life-assistant-chat__send {
  flex-shrink: 0;
  width: 52px;
  height: 36px;
  padding: 0;
  border-radius: 10px;
  border: none;
  background: var(--life-panel-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--life-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
  text-shadow: var(--life-text-shadow);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.life-assistant-chat__send:hover:not(:disabled) {
  background: var(--life-glass-btn-hover);
}

.life-assistant-chat__send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 1400px) {
  .life-assistant-column {
    width: 280px;
  }
}

@media (max-width: 1200px) {
  .life-assistant-column {
    display: none;
  }
}
</style>
