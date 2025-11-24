<!-- src/components/GanttChart.vue -->
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

// 2) Construction des lignes hiérarchiques : groupBy (Unité) -> groupBy2 (sous-ligne)
type Lane = {
  index: number;
  groupBy: string;   // Unité
  groupBy2: string;  // sous-groupe (ex: Personnel) ou vide
  label: string;
};

const laneHeight = 24;
const laneGap = 4;

const lanes = computed<Lane[]>(() => {
  const map = new Map<string, Lane>();
  let nextIndex = 0;

  for (const t of parsedTasks.value) {
    const g1 = (t.groupBy ?? '').toString();     // Unité
    const g2 = (t.groupBy2 ?? '').toString();    // Personnel (ou autre)
    const key = `${g1}||${g2}`;                  // couple (groupBy, groupBy2)

    if (!map.has(key)) {
      const isSub = g2 !== '';
      const label = isSub ? g2 : g1;             // on affiche g2 s'il existe, sinon g1
      map.set(key, {
        index: nextIndex++,
        groupBy: g1,
        groupBy2: g2,
        label,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.index - b.index);
});

// 3) Associer chaque tâche à un laneIndex
const tasksWithLane = computed(() => {
  const byKey = new Map<string, number>();
  for (const lane of lanes.value) {
    const key = `${lane.groupBy}||${lane.groupBy2}`;
    byKey.set(key, lane.index);
  }

  return parsedTasks.value.map((t) => {
    const g1 = (t.groupBy ?? '').toString();
    const g2 = (t.groupBy2 ?? '').toString();
    const key = `${g1}||${g2}`;
    const laneIndex = byKey.get(key) ?? 0;
    return { ...t, laneIndex };
  });
});

// Position verticale d'une ligne / d'une barre
function laneTopPx(laneIndex: number) {
  return laneGap + laneIndex * (laneHeight + laneGap);
}

function topPx(task: any) {
  return laneTopPx(task.laneIndex);
}

// 4) Échelle de temps
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
</script>

<template>
  <div class="gantt-wrapper">
    <!-- Colonne de gauche : lignes et sous-lignes -->
    <div class="gantt-sidebar">
      <div v-if="!lanes.length" class="gantt-empty">
        Aucune tâche
      </div>
      <div
        v-else
        v-for="lane in lanes"
        :key="lane.index"
        class="gantt-lane-label"
        :class="{ 'gantt-lane-sub': lane.groupBy2 !== '' }"
        :style="{ top: laneTopPx(lane.index) + 'px' }"
      >
        {{ lane.label || '—' }}
      </div>
    </div>

    <!-- Zone de droite : barres -->
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
          <!-- Ici on affiche Titre (name) dans la barre -->
          <span class="gantt-label">
            {{ task.name || 'Tâche' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gantt-wrapper {
  display: grid;
  grid-template-columns: 160px 1fr;
  height: 400px;
  border: 1px solid #374151;
  background-color: #111827;
  overflow: hidden;
  color: #e5e7eb;
}

/* Colonne de gauche */
.gantt-sidebar {
  position: relative;
  border-right: 1px solid #374151;
  padding-left: 4px;
  overflow: hidden;
}

.gantt-lane-label {
  position: absolute;
  height: 24px;
  display: flex;
  align-items: center;
  font-size: 12px;
  white-space: nowrap;
}

/* Sous-ligne (groupBy2) légèrement indentée */
.gantt-lane-sub {
  padding-left: 12px;
  font-size: 11px;
  color: #d1d5db;
}

/* Zone de droite */
.gantt {
  position: relative;
  overflow: auto;
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
