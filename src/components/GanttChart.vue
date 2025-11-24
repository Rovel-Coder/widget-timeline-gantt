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

// 2) Lignes hiérarchiques : groupBy (Unite) -> groupBy2 (Personnel)
type Lane = {
  index: number;
  groupBy: string;
  groupBy2: string;
  label: string;
  isGroupHeader: boolean;
};

const laneHeight = 24;
const laneGap = 4;

const lanes = computed<Lane[]>(() => {
  const result: Lane[] = [];
  let nextIndex = 0;

  const byGroup = new Map<string, typeof parsedTasks.value>();
  for (const t of parsedTasks.value) {
    const g1 = (t.groupBy ?? '').toString();
    if (!byGroup.has(g1)) byGroup.set(g1, []);
    byGroup.get(g1)!.push(t);
  }

  for (const [g1, tasks] of byGroup.entries()) {
    // ligne principale (Unite)
    result.push({
      index: nextIndex++,
      groupBy: g1,
      groupBy2: '',
      label: g1 || '—',
      isGroupHeader: true,
    });

    // sous-lignes (Personnel)
    const seenSub = new Set<string>();
    for (const t of tasks) {
      const g2 = (t.groupBy2 ?? '').toString();
      if (!g2 || seenSub.has(g2)) continue;
      seenSub.add(g2);
      result.push({
        index: nextIndex++,
        groupBy: g1,
        groupBy2: g2,
        label: g2,
        isGroupHeader: false,
      });
    }
  }

  return result;
});

// 3) Tâches avec laneIndex
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

function laneTopPx(laneIndex: number) {
  return laneGap + laneIndex * (laneHeight + laneGap);
}
function topPx(task: any) {
  return laneTopPx(task.laneIndex);
}

// 4) Échelle de temps commune
const minDate = computed(() => {
  if (!tasksWithLane.value.length) return new Date();
  return new Date(
    Math.min(...tasksWithLane.value.map((t) => t.startDate.getTime())),
  );
});

const maxDate = computed(() => {
  if (!tasksWithLane.value.length) return new Date();
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

// 5) Grille temporelle (un bloc par jour)
type DayBucket = {
  date: Date;
  label: string;
  left: number;   // en %
  width: number;  // en %
};

const dayBuckets = computed<DayBucket[]>(() => {
  const buckets: DayBucket[] = [];
  if (!tasksWithLane.value.length) return buckets;

  const start = new Date(minDate.value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(maxDate.value);
  end.setHours(23, 59, 59, 999);

  const oneDayMs = 24 * 60 * 60 * 1000;
  for (let ts = start.getTime(); ts <= end.getTime(); ts += oneDayMs) {
    const d = new Date(ts);
    const label = d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
    });

    const left =
      ((d.getTime() - minDate.value.getTime()) / totalMs.value) * 100;
    const width = (oneDayMs / totalMs.value) * 100;

    buckets.push({ date: d, label, left, width });
  }
  return buckets;
});
</script>

<template>
  <div class="gantt-wrapper">
    <!-- Colonne de gauche : Unite + Personnel -->
    <div class="gantt-sidebar">
      <div v-if="!lanes.length" class="gantt-empty">
        Aucune tâche
      </div>
      <div
        v-else
        v-for="lane in lanes"
        :key="lane.index"
        class="gantt-lane-label"
        :class="{
          'gantt-lane-group': lane.isGroupHeader,
          'gantt-lane-sub': !lane.isGroupHeader,
        }"
        :style="{ top: laneTopPx(lane.index) + 'px' }"
      >
        {{ lane.label || '—' }}
      </div>
    </div>

    <!-- Zone de droite : en-tête + barres -->
    <div class="gantt">
      <!-- En-tête temporel -->
      <div class="gantt-header" v-if="dayBuckets.length">
        <div
          v-for="bucket in dayBuckets"
          :key="bucket.label + bucket.left"
          class="gantt-header-cell"
          :style="{
            left: bucket.left + '%',
            width: bucket.width + '%',
          }"
        >
          {{ bucket.label }}
        </div>
      </div>

      <!-- Corps : barres -->
      <div class="gantt-body">
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
              {{ task.name || 'Tâche' }}
            </span>
          </div>
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

.gantt-lane-group {
  font-weight: 600;
  color: #f9fafb;
}

.gantt-lane-sub {
  padding-left: 12px;
  font-size: 11px;
  color: #d1d5db;
}

/* Zone de droite */
.gantt {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* En-tête temporel */
.gantt-header {
  position: relative;
  height: 28px;
  border-bottom: 1px solid #374151;
  background-color: #111827;
  font-size: 10px;
  color: #9ca3af;
  overflow: hidden;
}

.gantt-header-cell {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px solid #1f2937;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
}

/* Corps */
.gantt-body {
  position: relative;
  flex: 1;
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
