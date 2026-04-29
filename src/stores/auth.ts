import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

const TOKEN_KEY = 'token'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem(TOKEN_KEY) || '')
  const userName = ref<string>('')

  const isLoggedIn = computed(() => Boolean(token.value))

  const setToken = (value: string) => {
    token.value = value
    localStorage.setItem(TOKEN_KEY, value)
  }

  const clearAuth = () => {
    token.value = ''
    userName.value = ''
    localStorage.removeItem(TOKEN_KEY)
  }

  const login = async (payload: { username: string; password: string }) => {
    userName.value = payload.username
    setToken(`mock-token-${Date.now()}`)
  }

  const logout = () => {
    clearAuth()
  }

  return {
    token,
    userName,
    isLoggedIn,
    setToken,
    clearAuth,
    login,
    logout,
  }
})
