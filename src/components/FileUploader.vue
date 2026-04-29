<script setup lang="ts">
import { useFileUpload } from '@/composables/useFileUpload'
import { computed } from 'vue'
import { ElMessage } from 'element-plus'

const { progress, upload } = useFileUpload()

const progressStatus = computed(() => {
  if (progress.value?.stage === 'done') return 'success'
  if (progress.value?.stage === 'error') return 'exception'
  return ''
})

async function handleChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  try {
    await upload(file)
    ElMessage.success('文件上传并索引成功')
  } catch (error) {
    const message = error instanceof Error ? error.message : '上传失败'
    ElMessage.error(message)
  }
}
</script>

<template>
    <div class="uploader">
      <input type="file" @change="handleChange" accept=".md,.txt" />
  
      <div v-if="progress" class="progress">
        <span>{{ progress.message }}</span>
        <el-progress :percentage="progress.percent" :status="progressStatus" />
      </div>
    </div>
</template>
  
