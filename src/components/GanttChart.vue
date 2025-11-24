<script setup lang="ts">
import { computed } from 'vue';
import type { Task } from '../gristBridge';

const props = defineProps<{ tasks: Task[] }>();

// Conversion des tâches en objets avec dates JS
const parsedTasks = computed(() =>
  props.tasks
    .filter((t) => t.start && t.duration != null)
    .map((t) => {
      const startDate = new Date(t.start as string);
      const endDate = new Date(
        startDate.getTime() + (t.duration as number) * 24 * 60 * 60 * 1000,
      );
      return { ...t, startDate, endDate };
    }),
);

// Si aucune tâche valide, on évite Math.min/Math.max sur un tableau vide
const minDate = computed(() => {
  if (!parsedTasks.value.length) {
    return new Date();
  }
  return new Date(
    Math.min(...parsedTasks.value.map((t) => t.startDate.getTime())),
  );
});

const maxDate = computed(() => {
  if (!parsedTasks.value.length) {
    return new Date();
  }
  return new Date(
    Math.max(...parsedTasks.value.map((t) => t.endDate.getTime())),
  );
});

const totalMs = computed(() => {
  const diff = maxDate.value.getTime() - minDate.value.getTime();
  return diff || 1; // pour éviter division par 0
});

function leftPercent(task: any) {
  return (
    ((task.startDate.getTime() - minDate.value.getTime()) /
      totalMs.value) *
    100
  );
}

function widthPercent(task: any) {
  return (
    ((task.endDate.getTime() - task.startDate.getTime()) /
      totalMs.value) *
    100
  );
}
</script>

<template>
  <div class="gantt">
    <div v-if="!parsedTasks.length" class="gantt-empty">
      Aucune tâche à afficher
    </div>

    <div v-else>
      <div
        v-for="task in parsedTasks"
        :key="task.id"
        class="gantt-bar"
        :style="{
          left: leftPercent(task) + '%',
          width: widthPercent(task) + '%',
          backgroundColor: task.color || '#4caf50',
        }"
      >
        <span class="gantt-label">
          {{ task.name || task.groupBy || 'Tâche' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gantt {
  position: relative;
  height: 400px;
  border: 1px solid #ccc;
  overflow: hidden;
  background-color: #111827;
}

.gantt-empty {
  padding: 8px;
  font-size: 13px;
  color: #9ca3af;
}

.gantt-bar {
  position: absolute;
  top: 10px; /* provisoire: toutes les barres sur la même ligne */
  height: 24px;
  border-radius: 4px;
  margin-top: 4px;
  display: flex;
  align-items: center;
}

.gantt-label {
  font-size: 11px;
  color: white;
  padding: 2px 4px;
  white-space: nowrap;
}
</style>
