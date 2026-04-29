<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const form = reactive({
  username: 'admin',
  password: '123456',
})

const handleLogin = async () => {
  await authStore.login(form)
  ElMessage.success('登录成功')
  const redirect = (route.query.redirect as string) || '/'
  router.replace(redirect)
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-950 p-6">
    <el-card class="w-full max-w-md border-cyan-300/25 bg-slate-900/60" shadow="hover">
      <template #header>
        <span class="text-cyan-200">系统登录</span>
      </template>

      <el-form label-position="top">
        <el-form-item label="用户名">
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password />
        </el-form-item>
      </el-form>

      <el-button class="w-full" type="primary" @click="handleLogin">登录并进入首页</el-button>
    </el-card>
  </div>
</template>
