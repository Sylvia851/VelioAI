<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useDark } from '@vueuse/core'
import { useCounterStore } from '@/stores/counter'

const isDark = useDark()
const entered = ref(false)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const counterStore = useCounterStore()

interface Dot {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

let dots: Dot[] = []
let animId = 0
let cleanupResize: (() => void) | null = null

function initCanvas() {
  const cvs = canvasRef.value
  if (!cvs) return

  const dpr = window.devicePixelRatio || 1
  const resize = () => {
    cvs.width = cvs.offsetWidth * dpr
    cvs.height = cvs.offsetHeight * dpr
  }
  resize()
  window.addEventListener('resize', resize)
  cleanupResize = () => window.removeEventListener('resize', resize)

  const TOTAL = 80
  const LINK_DIST = 120

  dots = Array.from({ length: TOTAL }, () => ({
    x: Math.random() * cvs.width,
    y: Math.random() * cvs.height,
    vx: (Math.random() - 0.5) * 0.6,
    vy: (Math.random() - 0.5) * 0.6,
    r: 1.2 + Math.random() * 1.8,
  }))

  const ctx = cvs.getContext('2d')!

  const draw = () => {
    ctx.clearRect(0, 0, cvs.width, cvs.height)

    for (const d of dots) {
      d.x += d.vx
      d.y += d.vy
      if (d.x < 0 || d.x > cvs.width) d.vx *= -1
      if (d.y < 0 || d.y > cvs.height) d.vy *= -1
    }

    const linkDist = LINK_DIST * dpr
    for (let i = 0; i < TOTAL; i++) {
      for (let j = i + 1; j < TOTAL; j++) {
        const dx = dots[i].x - dots[j].x
        const dy = dots[i].y - dots[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < linkDist) {
          const alpha = 1 - dist / linkDist
          ctx.strokeStyle = `rgba(103,232,249,${alpha * 0.35})`
          ctx.lineWidth = 0.6 * dpr
          ctx.beginPath()
          ctx.moveTo(dots[i].x, dots[i].y)
          ctx.lineTo(dots[j].x, dots[j].y)
          ctx.stroke()
        }
      }
    }

    for (const d of dots) {
      ctx.beginPath()
      ctx.arc(d.x, d.y, d.r * dpr, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(103,232,249,0.7)'
      ctx.shadowColor = 'rgba(34,211,238,0.9)'
      ctx.shadowBlur = 8 * dpr
      ctx.fill()
      ctx.shadowBlur = 0
    }

    animId = requestAnimationFrame(draw)
  }

  draw()
}

onMounted(() => {
  initCanvas()
  requestAnimationFrame(() => {
    entered.value = true
  })
})

onUnmounted(() => {
  cancelAnimationFrame(animId)
  cleanupResize?.()
})
</script>

<template>
  <section class="hero-screen relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
    <!-- radial glow -->
    <div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.3),transparent_40%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.28),transparent_45%),radial-gradient(circle_at_50%_80%,rgba(34,197,94,0.2),transparent_40%)]" />
    <!-- grid -->
    <div class="tech-grid absolute inset-0 opacity-40" />
    <!-- scanlines -->
    <div class="scanline absolute inset-0 opacity-20" />

    <!-- canvas particles -->
    <canvas ref="canvasRef" class="pointer-events-none absolute inset-0 h-full w-full" />

    <!-- content -->
    <div class="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:px-10">
      <!-- header -->
      <header
        class="flex items-center justify-between transition-all duration-700"
        :class="entered ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0'"
      >
        <div class="flex items-center gap-3">
          <div class="h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.95)]" />
          <span class="text-xs tracking-[0.35em] text-cyan-200/80">VELIO AI FRONTEND SYSTEM</span>
        </div>
        <div class="flex items-center gap-2 rounded-full border border-cyan-300/30 bg-slate-900/60 px-3 py-1.5 backdrop-blur">
          <span class="text-xs text-slate-300">暗黑</span>
          <el-switch v-model="isDark" inline-prompt active-text="ON" inactive-text="OFF" />
        </div>
      </header>

      <!-- main -->
      <main class="my-auto grid items-center gap-8 lg:grid-cols-[1.3fr_0.9fr]">
        <!-- left column -->
        <div class="space-y-6">
          <p
            class="reveal-item inline-flex items-center rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-1 text-xs tracking-[0.25em] text-cyan-200 transition-all duration-700 delay-200"
            :class="entered ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'"
          >
            NEXT-GEN INTERACTIVE DASHBOARD
          </p>

          <h1
            class="hero-title max-w-4xl text-5xl font-semibold leading-tight transition-all duration-1000 delay-400 md:text-7xl"
            :class="entered ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'"
          >
            科技感首屏
            <span class="block text-cyan-300">Canvas 粒子连线</span>
          </h1>

          <p
            class="max-w-2xl text-base text-slate-300/85 transition-all duration-700 delay-600 md:text-lg"
            :class="entered ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'"
          >
            基于 Vue 3、Vite、TypeScript、Element Plus、Tailwind CSS，构建可拓展的实时视觉首屏。
            背景使用 Canvas 实时绘制粒子与邻近连线，搭配网格、扫描线与光晕效果。
          </p>

          <div
            class="flex flex-wrap items-center gap-3 transition-all duration-700 delay-800"
            :class="entered ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'"
          >
            <el-button type="primary" size="large" @click="counterStore.increment()">触发能量 +1</el-button>
            <el-button size="large" plain>查看架构</el-button>
            <span class="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-1.5 text-sm text-emerald-200">
              当前能量值：{{ counterStore.energy }}
            </span>
          </div>
        </div>

        <!-- right panel -->
        <el-card
          class="display-panel border-cyan-300/25 bg-slate-900/55 backdrop-blur transition-all duration-1000 delay-1000"
          :class="entered ? 'translate-x-0 scale-100 opacity-100' : 'translate-x-16 scale-95 opacity-0'"
          shadow="never"
        >
          <template #header>
            <div class="flex items-center justify-between text-sm">
              <span class="text-cyan-200">实时模块状态</span>
              <span class="rounded-full bg-cyan-300/20 px-2 py-0.5 text-xs text-cyan-200">ACTIVE</span>
            </div>
          </template>

          <div class="space-y-4 text-sm text-slate-300">
            <div
              v-for="(item, i) in [
                { label: '渲染引擎', status: 'RUNNING' },
                { label: '组件按需加载', status: 'READY' },
                { label: '暗黑模式系统', status: 'SYNCED' },
              ]"
              :key="i"
              class="status-row flex items-center justify-between rounded-lg border border-slate-700/70 px-3 py-2 transition-all duration-500"
              :class="entered ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'"
              :style="{ transitionDelay: `${1200 + i * 150}ms` }"
            >
              <span>{{ item.label }}</span>
              <span class="text-emerald-300">{{ item.status }}</span>
            </div>
          </div>
        </el-card>
      </main>
    </div>
  </section>
</template>

<style scoped>
.hero-screen::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(8, 47, 73, 0.26), rgba(67, 56, 202, 0.24), rgba(15, 23, 42, 0.38));
}

.tech-grid {
  background-image:
    linear-gradient(rgba(125, 211, 252, 0.14) 1px, transparent 1px),
    linear-gradient(90deg, rgba(125, 211, 252, 0.14) 1px, transparent 1px);
  background-size: 36px 36px;
  mask-image: radial-gradient(circle at center, black 40%, transparent 95%);
}

.scanline {
  background: repeating-linear-gradient(
    to bottom,
    rgba(148, 163, 184, 0) 0,
    rgba(148, 163, 184, 0) 4px,
    rgba(148, 163, 184, 0.15) 5px,
    rgba(148, 163, 184, 0) 6px
  );
}

.hero-title {
  text-shadow: 0 0 20px rgba(56, 189, 248, 0.35), 0 0 48px rgba(45, 212, 191, 0.2);
  animation: pulse-glow 3.5s ease-in-out infinite;
}

.display-panel {
  box-shadow: 0 0 40px rgba(34, 211, 238, 0.08), inset 0 0 40px rgba(14, 165, 233, 0.06);
}

@keyframes pulse-glow {
  0%,
  100% {
    opacity: 0.95;
  }
  50% {
    opacity: 1;
    filter: brightness(1.08);
  }
}
</style>
