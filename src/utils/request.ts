import axios, { type AxiosError, type AxiosRequestConfig } from 'axios'
import { getActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

const instance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 10000,
})

const METHODS_WITH_BODY = ['post', 'put', 'patch', 'delete']

function normalizeValidationDetail(detail: unknown): string {
  if (!Array.isArray(detail) || !detail.length) return ''

  return detail
    .map((item) => {
      const validation = item as { loc?: unknown[]; msg?: string }
      const path = Array.isArray(validation.loc) ? validation.loc.join('.') : ''
      const msg = validation.msg || '参数校验失败'
      return path ? `${path}: ${msg}` : msg
    })
    .join('; ')
}

instance.interceptors.request.use(
  (config) => {
    const method = String(config.method || 'get').toLowerCase()
    if (METHODS_WITH_BODY.includes(method) && config.data === undefined) {
      return Promise.reject(new Error(`请求参数不能为空: ${String(config.url || '')}`))
    }

    let token = ''
    if (getActivePinia()) {
      const authStore = useAuthStore()
      token = authStore.token
    }

    if (!token) {
      token = localStorage.getItem('token') || ''
    }

    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (error) => Promise.reject(error),
)

instance.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError<{ message?: string; msg?: string; detail?: unknown }>) => {
    const validationMessage = normalizeValidationDetail(error.response?.data?.detail)
    const message =
      validationMessage ||
      error.response?.data?.message ||
      error.response?.data?.msg ||
      String(error.response?.data?.detail || '') ||
      error.message ||
      'Request Error'

    console.error('[request error]', message)
    return Promise.reject(new Error(message))
  },
)

function request<T = unknown>(config: AxiosRequestConfig): Promise<T> {
  return instance.request(config) as unknown as Promise<T>
}

request.get = <T = unknown>(url: string, config?: AxiosRequestConfig) =>
  instance.get(url, config) as unknown as Promise<T>

request.delete = <T = unknown>(url: string, config?: AxiosRequestConfig) =>
  instance.delete(url, config) as unknown as Promise<T>

request.post = <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
  instance.post(url, data, config) as unknown as Promise<T>

request.put = <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
  instance.put(url, data, config) as unknown as Promise<T>

request.patch = <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
  instance.patch(url, data, config) as unknown as Promise<T>

export { instance as axiosInstance }
export default request
