<script setup lang="ts">
const props = defineProps<{
  timeScale: 'week' | 'month' | 'quarter' | 'p4s';
}>();

const emit = defineEmits<{
  (e: 'prev'): void;
  (e: 'next'): void;
  (e: 'today'): void;
  (e: 'changeScale', value: 'week' | 'month' | 'quarter' | 'p4s'): void;
}>();

function setScale(scale: 'week' | 'month' | 'quarter' | 'p4s') {
  emit('changeScale', scale);
}
</script>

<template>
  <div class="gantt-toolbar">
    <button class="gantt-btn" @click="emit('prev')">◀</button>
    <button class="gantt-btn" @click="emit('today')">Aujourd'hui</button>
    <button class="gantt-btn" @click="emit('next')">▶</button>

    <div class="gantt-toolbar-sep" />

    <button
      class="gantt-btn"
      :class="{ 'is-active': props.timeScale === 'week' }"
      @click="setScale('week')"
    >
      Semaine
    </button>
    <button
      class="gantt-btn"
      :class="{ 'is-active': props.timeScale === 'month' }"
      @click="setScale('month')"
    >
      Mois
    </button>
    <button
      class="gantt-btn"
      :class="{ 'is-active': props.timeScale === 'quarter' }"
      @click="setScale('quarter')"
    >
      Trimestre
    </button>
    <button
      class="gantt-btn"
      :class="{ 'is-active': props.timeScale === 'p4s' }"
      @click="setScale('p4s')"
    >
      P4S
    </button>
  </div>
</template>

<style scoped>
.gantt-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-bottom: 1px solid #374151;
  background-color: #020617;
  height: 25px;
  box-sizing: border-box;
}

.gantt-toolbar-sep {
  width: 1px;
  height: 18px;
  background: #374151;
  margin: 0 4px;
}

.gantt-btn {
  border: 1px solid #4b5563;
  background: #111827;
  color: #e5e7eb;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  cursor: pointer;
}

.gantt-btn.is-active {
  background: #2563eb;
  border-color: #2563eb;
}
</style>
