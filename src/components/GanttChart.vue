<script setup lang="ts">
import { computed } from 'vue';
import type { Task } from '../gristBridge';

const props = defineProps<{ tasks: Task[] }>();

const parsedTasks = computed(() =>
  props.tasks
    .filter(t => t.start && t.duration != null)
    .map(t => {
      const startDate = new Date(t.start as string);
      const endDate = new Date(startDate.getTime() + (t.duration as number) * 24 * 60 * 60 * 1000);
      return { ...t, startDate, endDate };
    }),
);

const minDate = computed(() =>
  new Date(Math.min(...parsedTasks.value.map(t => t.startDate.getTime()))),
);
const maxDate = computed(() =>
  new Date(Math.max(...parsedTasks.value.map(t => t.endDate.getTime()))),
);
const totalMs = computed(() =>
  maxDate.value.getTime() - minDate.value.getTime() || 1,
);

function leftPercent(task: any) {
  return ((task.startDate.getTime() - minDate.value.getTime()) / totalMs.value) * 100;
}
function widthPercent(task: any) {
  return ((task.endDate.getTime() - task.startDate.getTime()) / totalMs.value) * 100;
}
</script>

<template>
  <div class="gantt">
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
      <span class="gantt-label">{{ task.name }}</span>
    </div>
  </div>
</template>

<style scoped>
.gantt {
  position: relative;
  height: 400px;
  border: 1px solid #ccc;
  overflow: hidden;
}
.gantt-bar {
  position: absolute;
  top: 0;
  height: 24px;
  border-radius: 4px;
  margin-top: 4px;
}
.gantt-label {
  font-size: 11px;
  color: white;
  padding: 2px 4px;
}
</style>
