<script setup lang="ts">
import { inject } from 'vue';
import type { Ref } from 'vue';
import type { Task } from './gristBridge';
import GanttChart from './components/GanttChart.vue';

const tasks = inject<Ref<Task[]>>('tasks')!;
</script>

<template>
  <div class="gantt-root">
    <GanttChart :tasks="tasks" />
  </div>
</template>

<style>
.gantt-root {
  height: auto;
  margin: 0;
  overflow: hidden;
  font-family: system-ui, sans-serif;
}
</style>
