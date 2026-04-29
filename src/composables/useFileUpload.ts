import type { AxiosProgressEvent } from 'axios'
import request from '@/utils/request'

interface UploadProgress {
  stage: 'uploading' | 'parsing' | 'splitting' | 'embedding' | 'done' | 'error'
  percent: number
  message: string
}

interface IngestResponse {
  doc_id: string
  chunk_count: number
  message?: string
}

const ALLOWED_FILE_EXTENSIONS = ['txt', 'md', 'docx', 'doc', 'pdf', 'xlsx', 'xls'] as const
const FILE_EXTENSION_PATTERN = new RegExp(`\\.(${ALLOWED_FILE_EXTENSIONS.join('|')})$`, 'i')

export function useFileUpload() {
  const progress = ref<UploadProgress | null>(null)
  const controller = new AbortController()

  async function upload(file: File): Promise<IngestResponse> {
    if (!FILE_EXTENSION_PATTERN.test(file.name)) {
      throw new Error(`仅支持 ${ALLOWED_FILE_EXTENSIONS.map(ext => `.${ext}`).join('、')} 文件上传`)
    }

    const formData = new FormData()
    formData.append('file', file)

    const response = await request.post<IngestResponse>('/documents/file', formData, {
      signal: controller.signal,
      onUploadProgress: (e: AxiosProgressEvent) => {
        progress.value = {
          stage: 'uploading',
          percent: Math.round((e.loaded / (e.total ?? 1)) * 100),
          message: '上传中...',
        }
      },
    })

    progress.value = {
      stage: 'done',
      percent: 100,
      message: `索引完成：${response.doc_id}（${response.chunk_count} chunks）`,
    }

    return response
  }

  return { progress, upload, cancel: () => controller.abort() }
}