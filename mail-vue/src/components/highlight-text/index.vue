<template>
  <span><template v-for="(part, i) in parts" :key="i"><mark v-if="part.hit" class="hl-mark">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
</template>

<script setup>
import { computed } from 'vue'

// Marks the search terms inside plain text. Built from text nodes only (no
// v-html), so mail content can never inject markup through a match.
const props = defineProps({
  text: { type: String, default: '' },
  terms: { type: Array, default: () => [] },
})

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const parts = computed(() => {
  const text = props.text || ''
  const terms = props.terms.map(t => String(t || '').trim()).filter(t => t.length > 0)
  if (!text || !terms.length) return [{ text, hit: false }]
  const re = new RegExp(`(${terms.sort((a, b) => b.length - a.length).map(escape).join('|')})`, 'gi')
  // split() with one capture group alternates text, match, text, match…
  return text.split(re).map((piece, i) => ({ text: piece, hit: i % 2 === 1 })).filter(part => part.text)
})
</script>

<style scoped>
.hl-mark {
  background: var(--psg-highlight, rgba(250, 204, 21, 0.38));
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}
</style>
