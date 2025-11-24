<!-- src/components/GanttChart.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Task } from '../gristBridge';

const props = defineProps<{ tasks: Task[] }>();

// 0) Choix de l'échelle de temps et de l'heure de début de journée (vue semaine)
const timeScale = ref<'week' | 'month' | 'quarter'>('month');
const dayStartHour = ref<number>(0); // 0 = minuit

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

// 4) Bornes réelles (basées sur les tâches)
const rawMinDate = computed(() => {
  if (!tasksWithLane.value.length) return new Date();
  return new Date(
    Math.min(...tasksWithLane.value.map((t) => t.startDate.getTime())),
  );
});
const rawMaxDate = computed(() => {
  if (!tasksWithLane.value.length) return new Date();
  return new Date(
    Math.max(...tasksWithLane.value.map((t) => t.endDate.getTime())),
  );
});

// Bornes affichées selon timeScale
const minDate = computed(() => {
  const d = new Date(rawMinDate.value);
  if (timeScale.value === 'week') {
    const day = d.getDay(); // 0 = dimanche
    const diff = (day === 0 ? -6 : 1) - day; // jusqu'au lundi
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (timeScale.value === 'month') {
    d.setDate(1);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const q = Math.floor(d.getMonth() / 3);
  const qStart = new Date(d.getFullYear(), q * 3, 1);
  const day = qStart.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  qStart.setDate(qStart.getDate() + diff);
  qStart.setHours(0, 0, 0, 0);
  return qStart;
});

const maxDate = computed(() => {
  const d = new Date(rawMaxDate.value);
  if (timeScale.value === 'week') {
    const day = d.getDay();
    const diff = 7 - (day === 0 ? 7 : day); // jusqu'au dimanche
    d.setDate(d.getDate() + diff);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  if (timeScale.value === 'month') {
    d.setMonth(d.getMonth() + 1, 0); // dernier jour du mois
    const day = d.getDay();
    const diff = 7 - (day === 0 ? 7 : day);
    d.setDate(d.getDate() + diff);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  const q = Math.floor(d.getMonth() / 3);
  const qEnd = new Date(d.getFullYear(), q * 3 + 3, 0);
  const day = qEnd.getDay();
  const diff = 7 - (day === 0 ? 7 : day);
  qEnd.setDate(qEnd.getDate() + diff);
  qEnd.setHours(23, 59, 59, 999);
  return qEnd;
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

// 5) Grille temporelle selon l'échelle choisie
type TimeBucket = {
  start: Date;
  label: string;
  left: number;
  width: number;
};

const timeBuckets = computed<TimeBucket[]>(() => {
  const buckets: TimeBucket[] = [];
  if (!tasksWithLane.value.length) return buckets;

  const start = new Date(minDate.value);
  const end = new Date(maxDate.value);
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (timeScale.value === 'week') {
    // Une case par jour, label court "lun 24", "mar 25", etc.
    let ts = start.getTime();
    while (ts <= end.getTime()) {
      const base = new Date(ts);
      const bucketStart = new Date(base);
      bucketStart.setHours(dayStartHour.value, 0, 0, 0);

      const label = bucketStart.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: '2-digit',
      });

      const left =
        ((bucketStart.getTime() - minDate.value.getTime()) / totalMs.value) *
        100;
      const width = (oneDayMs / totalMs.value) * 100;

      buckets.push({ start: bucketStart, label, left, width });
      ts += oneDayMs;
    }
  } else if (timeScale.value === 'month') {
    // semaines complètes couvrant le mois
    let weekStart = new Date(start);
    while (weekStart <= end) {
      const weekEnd = new Date(weekStart.getTime() + 6 * oneDayMs);

      const monthLabel = weekStart.toLocaleDateString('fr-FR', {
        month: 'short',
      });
      const label = monthLabel;

      const left =
        ((weekStart.getTime() - minDate.value.getTime()) / totalMs.value) *
        100;
      const width =
        ((weekEnd.getTime() - weekStart.getTime() + oneDayMs) /
          totalMs.value) *
        100;

      buckets.push({ start: weekStart, label, left, width });
      weekStart = new Date(weekStart.getTime() + 7 * oneDayMs);
    }
  } else {
    // quarter : un bucket par mois
    const d = new Date(start);
    d.setDate(1);
    while (d <= end) {
      const bucketStart = new Date(d);
      const bucketEnd = new Date(d);
      bucketEnd.setMonth(bucketEnd.getMonth() + 1, 0);

      const label = bucketStart.toLocaleDateString('fr-FR', {
        month: 'short',
        year: '2-digit',
      });

      const left =
        ((bucketStart.getTime() - minDate.value.getTime()) / totalMs.value) *
        100;
      const width =
        ((bucketEnd.getTime() - bucketStart.getTime() + oneDayMs) /
          totalMs.value) *
        100;

      buckets.push({ start: bucketStart, label, left, width });
      d.setMonth(d.getMonth() + 1, 1);
    }
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

    <!-- Zone de droite : toolbar + en-tête + barres -->
    <div class="gantt">
      <!-- Toolbar échelle de temps + début de journée -->
      <div class="gantt-toolbar">
        <button
          class="gantt-btn"
          :class="{ 'is-active': timeScale === 'week' }"
          @click="timeScale = 'week'"
        >
          Semaine
        </button>
        <button
          class="gantt-btn"
          :class="{ 'is-active': timeScale === 'month' }"
          @click="timeScale = 'month'"
        >
          Mois
        </button>
        <button
          class="gantt-btn"
          :class="{ 'is-active': timeScale === 'quarter' }"
          @click="timeScale = 'quarter'"
        >
          Trimestre
        </button>

        <label class="gantt-hour-label">
          Début journée
          <select v-model.number="dayStartHour" class="gantt-hour-select">
            <option :value="0">00 h</option>
            <option :value="6">06 h</option>
            <option :value="7">07 h</option>
            <option :value="8">08 h</option>
            <option :value="9">09 h</option>
            <option :value="10">10 h</option>
            <option :value="12">12 h</option>
          </select>
        </label>
      </div>

      <!-- En-tête temporel -->
      <div class="gantt-header" v-if="timeBuckets.length">
        <div
          v-for="bucket in timeBuckets"
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

/* Toolbar */
.gantt-toolbar {
  display: flex;
  gap: 4px;
  padding: 4px 6px;
  border-bottom: 1px solid #374151;
  background-color: #020617;
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

.gantt-hour-label {
  margin-left: auto;
  font-size: 11px;
  color: #9ca3af;
  display: flex;
  align-items: center;
  gap: 4px;
}

.gantt-hour-select {
  background: #111827;
  color: #e5e7eb;
  border: 1px solid #4b5563;
  border-radius: 3px;
  font-size: 11px;
  padding: 1px 4px;
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
