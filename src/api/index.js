import request from '@/utils/request'

export function loginApi(username, password) {
  return request.post('/login', { username, password })
}

export function getLogs(params) {
  return request.get('/logs', { params })
}

export function controlDevice(data) {
  return request.post('/control', data)
}

export function getSensorLatest() {
  return request.get('/sensors/latest')
}

export function getSensorHistory(params) {
  return request.get('/sensors/history', { params })
}
