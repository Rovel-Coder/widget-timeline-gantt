<script setup lang="ts">
import { computed } from 'vue';
import type { Task } from '../gristBridge';

const props = defineProps<{ tasks: Task[] }>();

// 1) Tâches avec dates JS
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

// 2) Attribution d'un index de ligne par valeur de groupBy (Personnel)
const tasksWithLane = computed(() => {
  const laneByGroup = new Map<string, number>();
  let nextLane = 0;

  return parsedTasks.value.map((t) => {
    const key = (t.groupBy ?? '').toString(); // ex: "Romain"
    if (!laneByGroup.has(key)) {
      laneByGroup.set(key, nextLane++);
    }
    const laneIndex = laneByGroup.get(key) ?? 0;
    return { ...t, laneIndex };
  });
});

// 3) Calcul de l'échelle de temps
const minDate = computed(() => {
  if (!tasksWithLane.value.length) {
    return new Date();
  }
  return new Date(
    Math.min(...tasksWithLane.value.map((t) => t.startDate.getTime())),
  );
});

const maxDate = computed(() => {
  if (!tasksWithLane.value.length) {
    return new Date();
  }
  return new Date(
    Math.max(...tasksWithLane.value.map((t) => t.endDate.getTime())),
  );
});

const totalMs = computed(() => {
  const diff = maxDate.value.getTime() - minDate.value.getTime();
  return diff || 1;
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

// 4) Hauteur d'une ligne pour positionner les barres verticalement
const laneHeight = 28; // px (24px barre + marges)
function topPx(task: any) {
  return 4 + task.laneIndex * laneHeight;
}
</script>


<template>
  <div class="gantt">
    <div v-if="!tasksWithLane.length" class="gantt-empty">
      Aucune tâche à afficher
    </div>

    <div v-else>
      <div
        v-for="task in tasksWithLane"
        :key="task.id"
        class="gantt-bar"
        :style="{
          top: topPx(task) + 'px',
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
  overflow: auto;
  background-color: #111827;
}

.gantt-empty {
  padding: 8px;
  font-size: 13px;
  color: #9ca3af;
}

.gantt-bar {
  position: absolute;
  height: 24px;
  border-radius: 4px;
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
