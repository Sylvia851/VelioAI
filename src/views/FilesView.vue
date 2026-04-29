<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useChat } from '@/composables/useChat'
import { useFileUpload } from '@/composables/useFileUpload'
import { renderMarkdown } from '@/utils/markdown'
import { useConversations } from '@/composables/useConversations'
import type { ConvMessage, ConvSource } from '@/composables/useConversations'

// ─── View-only message (adds transient flags not stored on server) ────────────
interface ViewMessage {
  id: string
  role: 'user' | 'assistant'
  content: string   // fully accumulated text
  sources?: ConvSource[]
  loading: boolean  // skeleton visible
  streaming: boolean // SSE chunks still arriving
  attachedFile?: { name: string; size: number } // file badge shown in user bubble
}

// ─── State ────────────────────────────────────────────────────────────────────
const sidebarCollapsed = ref(false)
const prompt = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const messagesEndRef = ref<HTMLDivElement | null>(null)
const currentConvId = ref<string | null>(null)
const messages = ref<ViewMessage[]>([])

// pending file attachment (not yet uploaded — uploaded on send)
const pendingFile = ref<File | null>(null)
const isUploadingFile = ref(false)

// drag
const dragCounter = ref(0)
const isDragging = computed(() => dragCounter.value > 0)

// ─── Composables ──────────────────────────────────────────────────────────────
const { loading, askStream } = useChat()
const { upload } = useFileUpload()
const {
  conversations,
  fetchConversations,
  createConversation,
  deleteConversation,
  fetchMessages,
  touchConversation,
  getDisplayTime,
} = useConversations()

const acceptedFileTypes = '.md,.txt,.docx,.doc,.pdf,.xlsx,.xls'
const isBusy = computed(() => loading.value || isUploadingFile.value)

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(fetchConversations)

// ─── Scroll ───────────────────────────────────────────────────────────────────
async function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
  await nextTick()
  messagesEndRef.value?.scrollIntoView({ behavior })
}

// ─── Conversation management ──────────────────────────────────────────────────
async function loadConversation(convId: string) {
  currentConvId.value = convId
  messages.value = []
  const history: ConvMessage[] = await fetchMessages(convId)
  messages.value = history.map((m): ViewMessage => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    sources: m.sources as ConvSource[],
    loading: false,
    streaming: false,
  }))
  scrollToBottom('instant')
}

function startNew() {
  currentConvId.value = null
  messages.value = []
}

// ─── Submit ───────────────────────────────────────────────────────────────────
async function submitPrompt() {
  const query = prompt.value.trim()
  if (!query) {
    ElMessage.warning('先输入一点内容吧')
    return
  }

  // Snapshot + clear pending file immediately so the UI chip disappears
  const fileToSend = pendingFile.value
  pendingFile.value = null

  // Ensure a backend conversation exists before the first message
  if (!currentConvId.value) {
    const conv = await createConversation()
    currentConvId.value = conv.id
  }
  const convId = currentConvId.value!

  // Optimistically show the user bubble (server persists it inside /query/stream).
  // NOTE: wrap with reactive() BEFORE pushing — otherwise mutations to the raw
  // object reference bypass Vue's proxy setter traps and the UI won't update
  // while streaming (the whole response would appear only after loading flips).
  const userMsg = reactive<ViewMessage>({
    id: `tmp-u-${Date.now()}`,
    role: 'user',
    content: query,
    loading: false,
    streaming: false,
    attachedFile: fileToSend ? { name: fileToSend.name, size: fileToSend.size } : undefined,
  })
  messages.value.push(userMsg)
  prompt.value = ''
  resetTextareaHeight()
  await scrollToBottom()

  // Loading skeleton for assistant — also reactive so SSE delta writes trigger rerenders.
  const assistantMsg = reactive<ViewMessage>({
    id: `tmp-a-${Date.now()}`,
    role: 'assistant',
    content: '',
    loading: true,
    streaming: false,
  })
  messages.value.push(assistantMsg)
  await scrollToBottom()

  try {
    // If a file was attached, upload it first to get doc_id for metadata_filter
    let metadataFilter: Record<string, unknown> | undefined
    if (fileToSend) {
      isUploadingFile.value = true
      try {
        const ingestResult = await upload(fileToSend)
        metadataFilter = { doc_id: ingestResult.doc_id }
      } finally {
        isUploadingFile.value = false
      }
    }

    await askStream(
      query,
      convId,
      // onChunk — each SSE delta arrives here; real typewriter from the network
      (chunk: string) => {
        if (assistantMsg.loading) {
          assistantMsg.loading = false
          assistantMsg.streaming = true
        }
        assistantMsg.content += chunk
        messagesEndRef.value?.scrollIntoView({ behavior: 'instant' })
      },
      // onSources — emitted after the last delta
      (sources: ConvSource[]) => {
        assistantMsg.sources = sources
        assistantMsg.streaming = false
      },
      metadataFilter,
    )

    // Refresh sidebar order so the active conv bubbles to the top
    touchConversation(convId)
    await scrollToBottom()
  } catch (error) {
    isUploadingFile.value = false
    assistantMsg.loading = false
    assistantMsg.streaming = false
    assistantMsg.content = '抱歉，请求失败，请稍后重试。'
    ElMessage.error(error instanceof Error ? error.message : '发送失败')
  }
}

// ─── File attachment helpers ──────────────────────────────────────────────────
const ALLOWED_EXTENSIONS = /\.(txt|md|docx|doc|pdf|xlsx|xls)$/i

function triggerFileSelect() { fileInputRef.value?.click() }

function attachFile(file: File) {
  if (!ALLOWED_EXTENSIONS.test(file.name)) {
    ElMessage.warning('仅支持 PDF / Word / Excel / Markdown / TXT')
    return
  }
  pendingFile.value = file
}

function clearPendingFile() { pendingFile.value = null }

function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  attachFile(file)
  ;(event.target as HTMLInputElement).value = ''
}

// ─── Drag & drop ─────────────────────────────────────────────────────────────
function handleDragEnter(e: DragEvent) {
  if (e.dataTransfer?.types.includes('Files')) dragCounter.value++
}
function handleDragLeave() { dragCounter.value = Math.max(0, dragCounter.value - 1) }
function handleDrop(e: DragEvent) {
  dragCounter.value = 0
  const file = e.dataTransfer?.files?.[0]
  if (file) attachFile(file)
}

// ─── Textarea helpers ─────────────────────────────────────────────────────────
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (!isBusy.value) submitPrompt()
  }
}
function autoResizeTextarea(event: Event) {
  const el = event.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}
function resetTextareaHeight() {
  if (textareaRef.value) textareaRef.value.style.height = 'auto'
}

// ─── Delete conversation ──────────────────────────────────────────────────────
async function onDeleteConv(convId: string, e: MouseEvent) {
  e.stopPropagation()
  await deleteConversation(convId)
  if (currentConvId.value === convId) startNew()
}
</script>

<template>
  <section class="workspace min-h-screen bg-slate-950 text-slate-100">
    <!-- Background -->
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.24),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(168,85,247,0.18),transparent_42%),radial-gradient(circle_at_40%_90%,rgba(34,197,94,0.16),transparent_40%)]" />
    <div class="tech-grid absolute inset-0 opacity-35" />
    <div class="scanline absolute inset-0 opacity-15" />

    <div class="relative z-10 flex h-screen overflow-hidden">

      <!-- ── Sidebar ── -->
      <aside
        class="flex flex-col border-r border-cyan-200/10 bg-slate-900/70 backdrop-blur transition-all duration-500"
        :class="sidebarCollapsed ? 'w-14' : 'w-72'"
      >
        <!-- header -->
        <div class="flex shrink-0 items-center justify-between border-b border-cyan-200/10 px-3 py-3.5">
          <span v-if="!sidebarCollapsed" class="text-[10px] tracking-[0.28em] text-cyan-200/70">CONVERSATIONS</span>
          <button
            class="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-cyan-300"
            @click="sidebarCollapsed = !sidebarCollapsed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        <!-- new conversation -->
        <div class="shrink-0 p-2">
          <button
            class="flex w-full items-center gap-2 rounded-xl border border-dashed border-cyan-300/25 px-3 py-2.5 text-left text-xs text-cyan-300/70 transition-all duration-200 hover:border-cyan-300/50 hover:bg-cyan-400/5 hover:text-cyan-300"
            :class="sidebarCollapsed ? 'justify-center' : ''"
            @click="startNew"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span v-if="!sidebarCollapsed">新建对话</span>
          </button>
        </div>

        <!-- conversation list -->
        <div class="sidebar-history flex-1 overflow-y-auto p-2 pt-0">
          <div v-if="conversations.length === 0 && !sidebarCollapsed" class="py-8 text-center text-xs text-slate-600">
            暂无历史对话
          </div>
          <button
            v-for="conv in conversations"
            :key="conv.id"
            class="history-card group relative mb-1.5 flex w-full items-start rounded-xl border px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-px"
            :class="currentConvId === conv.id
              ? 'border-cyan-300/40 bg-cyan-400/10 shadow-[0_0_14px_rgba(34,211,238,0.16)]'
              : 'border-slate-700/50 bg-slate-900/40 hover:border-cyan-300/25 hover:bg-slate-800/40'"
            :title="sidebarCollapsed ? conv.title : undefined"
            @click="loadConversation(conv.id)"
          >
            <template v-if="!sidebarCollapsed">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-slate-100">{{ conv.title }}</p>
                <p class="mt-0.5 text-[11px] text-slate-500">{{ getDisplayTime(conv) }}</p>
              </div>
              <button
                class="ml-1 shrink-0 rounded p-0.5 text-slate-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                @click="onDeleteConv(conv.id, $event)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </template>
            <template v-else>
              <div class="mx-auto h-2 w-2 rounded-full" :class="currentConvId === conv.id ? 'bg-cyan-300/80' : 'bg-slate-600'" />
            </template>
          </button>
        </div>
      </aside>

      <!-- ── Main area ── -->
      <main
        class="relative flex flex-1 flex-col overflow-hidden"
        @dragenter.prevent="handleDragEnter"
        @dragover.prevent
        @dragleave="handleDragLeave"
        @drop.prevent="handleDrop"
      >
        <!-- Drag overlay -->
        <transition name="fade-fast">
          <div
            v-if="isDragging"
            class="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm"
          >
            <div class="rounded-2xl border-2 border-dashed border-cyan-300/60 bg-slate-900/80 px-16 py-12 text-center shadow-[0_0_40px_rgba(34,211,238,0.25)]">
              <svg class="mx-auto mb-4 text-cyan-300/80" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              <p class="text-base font-medium text-cyan-200">松开即可上传</p>
              <p class="mt-1 text-sm text-slate-400">支持 PDF / Word / Excel / Markdown / TXT</p>
            </div>
          </div>
        </transition>

        <!-- Header -->
        <header class="flex shrink-0 items-center justify-between border-b border-cyan-200/10 bg-slate-900/60 px-6 py-3 backdrop-blur">
          <div>
            <p class="text-[10px] tracking-[0.26em] text-cyan-200/60">AI COMMUNICATION SPACE</p>
            <h1 class="text-base font-semibold text-slate-100">Velio AI 知识助手</h1>
          </div>
          <el-tag :type="isUploadingFile ? 'info' : loading ? 'warning' : 'success'" effect="dark" size="small">
            {{ isUploadingFile ? '索引文件...' : loading ? '思考中...' : '在线' }}
          </el-tag>
        </header>

        <!-- Messages -->
        <div class="messages-area flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <!-- Empty state -->
          <div v-if="messages.length === 0" class="flex h-full items-center justify-center">
            <div class="rounded-2xl border border-cyan-300/12 bg-slate-900/50 px-12 py-10 text-center">
              <p class="text-[10px] tracking-[0.35em] text-cyan-300/50">VELIO AI</p>
              <p class="mt-3 text-xl font-medium text-slate-200">有什么可以帮你？</p>
              <p class="mt-2 text-sm text-slate-500">直接提问，或拖入文件上传后开始探索</p>
            </div>
          </div>

          <!-- Message list -->
          <div class="mx-auto max-w-3xl space-y-6">
            <template v-for="msg in messages" :key="msg.id">

              <!-- User -->
              <div v-if="msg.role === 'user'" class="flex justify-end">
                <div class="max-w-[78%] space-y-2">
                  <!-- File badge -->
                  <div v-if="msg.attachedFile" class="flex justify-end">
                    <div class="flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-slate-800/80 px-3 py-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-cyan-400">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                      </svg>
                      <div class="min-w-0">
                        <p class="max-w-[180px] truncate text-xs font-medium text-cyan-200">{{ msg.attachedFile.name }}</p>
                        <p class="text-[11px] text-slate-500">{{ formatFileSize(msg.attachedFile.size) }}</p>
                      </div>
                    </div>
                  </div>
                  <!-- Message bubble -->
                  <div class="rounded-2xl rounded-tr-sm border border-cyan-300/22 bg-cyan-500/10 px-4 py-3">
                    <p class="whitespace-pre-wrap text-sm leading-7 text-slate-100">{{ msg.content }}</p>
                  </div>
                </div>
              </div>

              <!-- Assistant -->
              <div v-else class="flex gap-3">
                <div class="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-300/30 bg-slate-800 text-[11px] font-medium text-cyan-300">
                  AI
                </div>
                <div class="flex-1">
                  <!-- Skeleton (waiting for first chunk) -->
                  <div v-if="msg.loading" class="space-y-2 pt-2">
                    <p v-if="isUploadingFile" class="text-xs text-cyan-300/60">正在索引文件...</p>
                    <div class="h-3 w-2/3 animate-pulse rounded bg-slate-700/70" />
                    <div class="h-3 w-5/6 animate-pulse rounded bg-slate-700/60" />
                    <div class="h-3 w-1/2 animate-pulse rounded bg-slate-700/50" />
                  </div>

                  <!-- Answer bubble -->
                  <div v-else class="rounded-2xl rounded-tl-sm border border-slate-700/50 bg-slate-800/55 px-4 py-3">
                    <!-- Markdown rendered content -->
                    <div
                      class="md-body text-sm text-slate-200"
                      v-html="renderMarkdown(msg.content)"
                    />
                    <!-- Blinking cursor during streaming -->
                    <span
                      v-if="msg.streaming"
                      class="mt-0.5 inline-block h-4 w-0.5 animate-blink bg-cyan-300 align-middle"
                    />

                    <!-- Sources appear after streaming ends -->
                    <div v-if="!msg.streaming && msg.sources && msg.sources.length" class="mt-3 space-y-1.5 border-t border-slate-700/40 pt-3">
                      <p class="text-[10px] tracking-[0.22em] text-cyan-300/55">引用来源 · {{ msg.sources.length }}</p>
                      <div
                        v-for="source in msg.sources"
                        :key="source.chunk_id"
                        class="rounded-lg border border-slate-700/45 bg-slate-900/55 px-3 py-2 text-xs"
                      >
                        <p class="mb-1 text-cyan-200/75">{{ source.doc_id }}</p>
                        <p class="line-clamp-2 text-slate-500">{{ source.content }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </template>
            <div ref="messagesEndRef" class="h-px" />
          </div>
        </div>

        <!-- Input area -->
        <div class="shrink-0 border-t border-cyan-200/10 bg-slate-900/60 px-4 py-4 backdrop-blur lg:px-8">
          <div class="mx-auto max-w-3xl">
            <!-- Pending file chip -->
            <transition name="fade-slide">
              <div v-if="pendingFile" class="mb-2 flex items-center gap-2 rounded-xl border border-cyan-300/25 bg-slate-900/70 px-3 py-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-cyan-400">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
                <span class="flex-1 truncate text-xs text-cyan-200">{{ pendingFile.name }}</span>
                <span class="shrink-0 text-[11px] text-slate-500">{{ formatFileSize(pendingFile.size) }}</span>
                <button
                  class="ml-1 shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:text-red-400"
                  title="移除文件"
                  @click="clearPendingFile"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </transition>

            <!-- Input box -->
            <div
              class="flex items-end gap-2 rounded-2xl border bg-slate-900/80 px-3 py-2.5 transition-all duration-200 focus-within:shadow-[0_0_0_1px_rgba(34,211,238,0.3)]"
              :class="isBusy ? 'border-slate-700/50' : 'border-cyan-300/22 focus-within:border-cyan-300/55'"
            >
              <input ref="fileInputRef" type="file" class="hidden" :accept="acceptedFileTypes" @change="handleFileChange" />

              <textarea
                ref="textareaRef"
                v-model="prompt"
                rows="1"
                placeholder="输入消息… Enter 发送，Shift+Enter 换行，或拖文件到此处附加"
                class="chat-textarea flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder-slate-600 outline-none"
                :disabled="isBusy"
                @keydown="handleKeydown"
                @input="autoResizeTextarea"
              />

              <div class="flex shrink-0 items-center gap-1.5 pb-0.5">
                <!-- Attach file button -->
                <button
                  :disabled="isBusy"
                  class="rounded-lg p-1.5 transition-colors disabled:opacity-40"
                  :class="pendingFile ? 'text-cyan-400 hover:text-cyan-300' : 'text-slate-500 hover:bg-slate-700/50 hover:text-cyan-300'"
                  title="附加文件"
                  @click="triggerFileSelect"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>

                <el-button
                  type="primary"
                  size="small"
                  :loading="loading || isUploadingFile"
                  :disabled="isBusy || !prompt.trim()"
                  class="!rounded-xl !px-3"
                  @click="submitPrompt"
                >
                  发送
                </el-button>
              </div>
            </div>

            <p class="mt-1.5 text-center text-[11px] text-slate-700">
              附加文件后发送消息，AI 将只针对该文件作答 · 支持 PDF / Word / Excel / Markdown / TXT
            </p>
          </div>
        </div>
      </main>
    </div>
  </section>
</template>

<style scoped>
.workspace {
  position: relative;
  overflow: hidden;
}

.tech-grid {
  background-image:
    linear-gradient(rgba(125, 211, 252, 0.14) 1px, transparent 1px),
    linear-gradient(90deg, rgba(125, 211, 252, 0.14) 1px, transparent 1px);
  background-size: 34px 34px;
  mask-image: radial-gradient(circle at center, black 45%, transparent 95%);
}

.scanline {
  background: repeating-linear-gradient(
    to bottom,
    rgba(148, 163, 184, 0) 0,
    rgba(148, 163, 184, 0) 4px,
    rgba(148, 163, 184, 0.12) 5px,
    rgba(148, 163, 184, 0) 6px
  );
}

/* ── Themed scrollbars ── */
.messages-area,
.sidebar-history {
  scrollbar-width: thin;
  scrollbar-color: rgba(125, 211, 252, 0.18) transparent;
}

.messages-area::-webkit-scrollbar,
.sidebar-history::-webkit-scrollbar {
  width: 4px;
}

.messages-area::-webkit-scrollbar-track,
.sidebar-history::-webkit-scrollbar-track {
  background: transparent;
}

.messages-area::-webkit-scrollbar-thumb,
.sidebar-history::-webkit-scrollbar-thumb {
  background: rgba(125, 211, 252, 0.18);
  border-radius: 2px;
}

.messages-area::-webkit-scrollbar-thumb:hover,
.sidebar-history::-webkit-scrollbar-thumb:hover {
  background: rgba(125, 211, 252, 0.38);
}

.chat-textarea {
  max-height: 160px;
  line-height: 1.65;
}

.history-card {
  animation: fade-in 0.25s ease both;
}

/* Transitions */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.25s ease;
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.fade-fast-enter-active,
.fade-fast-leave-active {
  transition: opacity 0.15s ease;
}
.fade-fast-enter-from,
.fade-fast-leave-to {
  opacity: 0;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Streaming cursor */
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
.animate-blink {
  animation: blink 0.8s step-start infinite;
}

/* ── Markdown body ─────────────────────────────────────────────────────────── */
.md-body {
  line-height: 1.75;
  word-break: break-word;
}

.md-body > *:first-child { margin-top: 0; }
.md-body > *:last-child  { margin-bottom: 0; }

.md-body h1,
.md-body h2,
.md-body h3,
.md-body h4 {
  font-weight: 600;
  color: #e2e8f0;
  margin-top: 1.2em;
  margin-bottom: 0.4em;
  line-height: 1.4;
}
.md-body h1 { font-size: 1.2rem; }
.md-body h2 {
  font-size: 1.05rem;
  padding-bottom: 0.25em;
  border-bottom: 1px solid rgba(125, 211, 252, 0.15);
}
.md-body h3 { font-size: 0.95rem; color: #67e8f9; }
.md-body h4 { font-size: 0.875rem; color: #94a3b8; }

.md-body p {
  margin-bottom: 0.75em;
  color: #cbd5e1;
}

.md-body ul,
.md-body ol {
  padding-left: 1.5em;
  margin-bottom: 0.75em;
  color: #cbd5e1;
}
.md-body ul { list-style-type: disc; }
.md-body ol { list-style-type: decimal; }
.md-body li { margin-bottom: 0.2em; }
.md-body li > ul,
.md-body li > ol { margin-top: 0.2em; margin-bottom: 0; }

/* Inline code */
.md-body :not(pre) > code {
  font-family: 'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace;
  font-size: 0.82em;
  background: rgba(125, 211, 252, 0.08);
  border: 1px solid rgba(125, 211, 252, 0.18);
  border-radius: 4px;
  padding: 0.1em 0.38em;
  color: #67e8f9;
}

/* Code block */
.md-body pre {
  background: rgba(2, 6, 23, 0.85);
  border: 1px solid rgba(125, 211, 252, 0.14);
  border-radius: 10px;
  padding: 1rem 1.1rem;
  overflow-x: auto;
  margin-bottom: 0.85em;
  font-size: 0.85rem;
  scrollbar-width: thin;
  scrollbar-color: rgba(125, 211, 252, 0.15) transparent;
}
.md-body pre::-webkit-scrollbar { height: 3px; }
.md-body pre::-webkit-scrollbar-thumb { background: rgba(125, 211, 252, 0.18); border-radius: 2px; }

.md-body pre code {
  background: none;
  border: none;
  padding: 0;
  color: #cbd5e1;
  font-family: 'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace;
  font-size: 1em;
}

.md-body blockquote {
  border-left: 3px solid rgba(34, 211, 238, 0.45);
  padding: 0.1em 0 0.1em 1em;
  margin: 0 0 0.75em;
  color: #94a3b8;
  font-style: italic;
}

.md-body table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0.85em;
  font-size: 0.85rem;
  display: block;
  overflow-x: auto;
}
.md-body th {
  background: rgba(125, 211, 252, 0.07);
  border: 1px solid rgba(125, 211, 252, 0.15);
  padding: 0.45em 0.7em;
  text-align: left;
  color: #67e8f9;
  font-weight: 500;
  white-space: nowrap;
}
.md-body td {
  border: 1px solid rgba(71, 85, 105, 0.4);
  padding: 0.4em 0.7em;
  color: #cbd5e1;
}
.md-body tr:nth-child(even) td { background: rgba(30, 41, 59, 0.3); }

.md-body hr {
  border: none;
  border-top: 1px solid rgba(125, 211, 252, 0.12);
  margin: 1em 0;
}

.md-body a {
  color: #67e8f9;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: rgba(103, 232, 249, 0.4);
}
.md-body a:hover { text-decoration-color: rgba(103, 232, 249, 0.8); }

.md-body strong { color: #f1f5f9; font-weight: 600; }
.md-body em     { color: #94a3b8; }

/* ── highlight.js token colors (dark-tech palette) ─────────────────────────── */
.md-body .hljs-comment,
.md-body .hljs-quote       { color: #475569; font-style: italic; }

.md-body .hljs-keyword,
.md-body .hljs-selector-tag,
.md-body .hljs-built_in    { color: #a78bfa; }

.md-body .hljs-string,
.md-body .hljs-template-string,
.md-body .hljs-addition     { color: #34d399; }

.md-body .hljs-number,
.md-body .hljs-literal,
.md-body .hljs-boolean      { color: #fb923c; }

.md-body .hljs-function,
.md-body .hljs-title,
.md-body .hljs-section       { color: #67e8f9; }

.md-body .hljs-type,
.md-body .hljs-class         { color: #f472b6; }

.md-body .hljs-variable,
.md-body .hljs-name,
.md-body .hljs-attr          { color: #e2e8f0; }

.md-body .hljs-tag            { color: #a78bfa; }
.md-body .hljs-attribute      { color: #67e8f9; }
.md-body .hljs-deletion       { color: #f87171; }
.md-body .hljs-meta           { color: #64748b; }
</style>
