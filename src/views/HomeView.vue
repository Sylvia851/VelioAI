<script setup lang="ts">
import { useRouter } from 'vue-router'
import HelloWorld from '@/components/HelloWorld.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const handleLogout = () => {
  authStore.logout()
  router.replace('/login')
}
</script>

<template>
  <div class="relative">
    <div class="absolute right-6 top-6 z-20">
      <el-button plain type="danger" @click="handleLogout">退出登录</el-button>
    </div>
    <HelloWorld />
  </div>
</template>
