<template>
  <svg class="undo-send-ring" viewBox="0 0 36 36" aria-hidden="true">
    <circle class="track" cx="18" cy="18" :r="R" />
    <circle class="arc" cx="18" cy="18" :r="R"
            :stroke-dasharray="CIRC" :stroke-dashoffset="CIRC * (1 - fraction)" />
    <text x="18" y="18" text-anchor="middle" dominant-baseline="central">{{ secondsLeft }}</text>
  </svg>
</template>

<script setup>
import {computed, onMounted, onUnmounted, ref} from "vue";

// Countdown to the real server-side send time (deadline, epoch ms), not to the
// notification's own close timer — Element pauses that timer on hover, but the
// scheduled send does not wait.
const props = defineProps({
  deadline: { type: Number, required: true },
  totalSeconds: { type: Number, required: true },
})

const R = 15
const CIRC = 2 * Math.PI * R

const now = ref(Date.now())
let raf = 0
function tick() {
  now.value = Date.now()
  if (now.value < props.deadline) raf = requestAnimationFrame(tick)
}
onMounted(() => { raf = requestAnimationFrame(tick) })
onUnmounted(() => cancelAnimationFrame(raf))

const msLeft = computed(() => Math.max(0, props.deadline - now.value))
const fraction = computed(() => Math.min(1, msLeft.value / (props.totalSeconds * 1000)))
const secondsLeft = computed(() => Math.ceil(msLeft.value / 1000))
</script>

<style scoped>
.undo-send-ring {
  width: 36px;
  height: 36px;
  display: block;
}
.track, .arc {
  fill: none;
  stroke-width: 3;
}
.track {
  stroke: var(--el-color-primary-light-8);
}
.arc {
  stroke: var(--el-color-primary);
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
}
text {
  fill: var(--el-color-primary);
  font-size: 13px;
  font-style: normal; /* EP renders the icon slot inside an <i> */
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
