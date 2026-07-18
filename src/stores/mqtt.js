import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  initMqtt,
  destroyMqtt,
  sendLockCommand,
  sendLightCommand,
  sendAcCommand,
  mqttData,
  temperature as serviceTemperature,
  humidity as serviceHumidity,
  ac as serviceAc,
  doorStatus as serviceDoorStatus,
  doorType as serviceDoorType,
  lightStatus as serviceLightStatus,
  lightType as serviceLightType,
} from '@/services/mqttService'

export const useMqttStore = defineStore('mqtt', () => {
  const connected = ref(false)
  const connecting = ref(false)
  const lastMessageAt = ref(null)
  const error = ref('')

  const temperature = ref(null)
  const humidity = ref(null)
  const illuminance = ref(null)

  const doorStatus = ref(null)
  const doorType = ref(null)
  const ac = ref(null)
  const lightStatus = ref(null)
  const lightType = ref(null)

  function syncFromService() {
    connected.value = mqttData.mqttConnected
    connecting.value = mqttData.connecting
    error.value = mqttData.error
    lastMessageAt.value = mqttData.lastMessageAt

    temperature.value = serviceTemperature.value
    humidity.value = serviceHumidity.value
    ac.value = serviceAc.value

    doorStatus.value = serviceDoorStatus.value
    doorType.value = serviceDoorType.value
    lightStatus.value = serviceLightStatus.value
    lightType.value = serviceLightType.value
  }

  function connect() {
    if (connected.value || connecting.value) return
    initMqtt(syncFromService)
    syncFromService()
  }

  function disconnect() {
    destroyMqtt()
    syncFromService()
  }

  /**
   * 兼容现有 UI 的控制发布接口
   * door: open -> unlock, close/lock -> lock
   * light: on/off -> device3 cmd
   * ac: on/off -> device2 cmd (ac_on/ac_off)
   */
  function publishControl(device, payload) {
    const action = payload?.action ?? payload?.cmd

    if (device === 'door') {
      if (action === 'open' || action === 'unlock') {
        return sendLockCommand('unlock')
      }
      if (action === 'close' || action === 'lock') {
        return sendLockCommand('lock')
      }
    }

    if (device === 'light') {
      if (action === 'on') {
        return sendLightCommand('on')
      }
      if (action === 'off') {
        return sendLightCommand('off')
      }
    }

    if (device === 'ac') {
      if (action === 'on' || action === 'ac_on') {
        return sendAcCommand('ac_on')
      }
      if (action === 'off' || action === 'ac_off') {
        return sendAcCommand('ac_off')
      }
    }

    throw new Error(`不支持的 MQTT 控制: ${device} / ${action}`)
  }

  return {
    connected,
    connecting,
    lastMessageAt,
    error,
    temperature,
    humidity,
    illuminance,
    doorStatus,
    doorType,
    ac,
    lightStatus,
    lightType,
    connect,
    disconnect,
    publishControl,
    sendLockCommand,
    sendLightCommand,
    sendAcCommand,
  }
})
