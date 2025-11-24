<!-- src/components/GanttChart.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Task } from '../gristBridge';

const props = defineProps<{ tasks: Task[] }>();

// échelle de temps
const timeScale = ref<'week' | 'month' | 'quarter'>('month');
// heure de début de journée (provenant des options Grist)
const dayStartHour = ref<number>(0);

declare const grist: any;

// Charger l'option "dayStartHour" depuis le panneau de config du widget
if (typeof grist !== 'undefined') {
  grist.onOptions((options: any) => {
    if (options && typeof options.dayStartHour === 'number') {
      dayStartHour.value = options.dayStartHour;
    } else {
      dayStartHour.value = 0;
    }
  });
}

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

/**
 * NOUVELLE LOGIQUE minDate / maxDate
 * - week    : exactement une semaine LUNDI -> DIMANCHE
 * - month   : du lundi de la 1ère semaine du mois au dimanche de la dernière semaine du même mois
 * - quarter : inchangé
 */
const minDate = computed(() => {
  const d = new Date(rawMinDate.value);

  // VUE SEMAINE : lundi de la semaine de rawMinDate
  if (timeScale.value === 'week') {
    const day = d.getDay(); // 0 = dimanche, 1 = lundi, ...
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // VUE MOIS : lundi de la première semaine qui intersecte le mois de rawMinDate
  if (timeScale.value === 'month') {
    // Se placer au 1er jour du mois de rawMinDate
    d.setDate(1);
    const day = d.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // VUE TRIMESTRE : inchangée
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

  // VUE SEMAINE : dimanche de la même semaine que minDate (toujours 7 jours)
  if (timeScale.value === 'week') {
    const day = d.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const monday = new Date(d);
    monday.setDate(monday.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return sunday;
  }

  // VUE MOIS : dimanche de la dernière semaine qui intersecte le même mois
  if (timeScale.value === 'month') {
    // Dernier jour du mois de rawMaxDate
    const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const day = lastDayOfMonth.getDay(); // 0 = dimanche, ...
    const diffToSunday = 7 - (day === 0 ? 7 : day);
    lastDayOfMonth.setDate(lastDayOfMonth.getDate() + diffToSunday);
    lastDayOfMonth.setHours(23, 59, 59, 999);
    return lastDayOfMonth;
  }

  // VUE TRIMESTRE : inchangée
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

// utilitaire : numéro de semaine ISO
function getIsoWeekNumber(date: Date): number {
  const tmp = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+tmp - +yearStart) / 86400000 + 1) / 7);
  return weekNo;
}

// 5) Buckets pour les deux lignes d'en-tête
type Bucket = { left: number; width: number; label: string };

// semaine : ligne1 semaines, ligne2 jours
const weekWeekBuckets = computed<Bucket[]>(() => {
  const res: Bucket[] = [];
  if (timeScale.value !== 'week') return res;
  const start = new Date(minDate.value);
  const end = new Date(maxDate.value);
  const oneDay = 24 * 60 * 60 * 1000;

  let weekStart = new Date(start);
  while (weekStart <= end) {
    const weekEnd = new Date(weekStart.getTime() + 6 * oneDay);
    const weekNumber = getIsoWeekNumber(weekStart);
    const left =
      ((weekStart.getTime() - minDate.value.getTime()) / totalMs.value) * 100;
    const width =
      ((weekEnd.getTime() - weekStart.getTime() + oneDay) / totalMs.value) *
      100;
    res.push({ left, width, label: `S${weekNumber}` });
    weekStart = new Date(weekStart.getTime() + 7 * oneDay);
  }
  return res;
});

const weekDayBuckets = computed<Bucket[]>(() => {
  const res: Bucket[] = [];
  if (timeScale.value !== 'week') return res;
  const start = new Date(minDate.value);
  const end = new Date(maxDate.value);
  const oneDay = 24 * 60 * 60 * 1000;

  for (let ts = start.getTime(); ts <= end.getTime(); ts += oneDay) {
    const d = new Date(ts);
    const bucketStart = new Date(d);
    bucketStart.setHours(dayStartHour.value, 0, 0, 0);
    const label = bucketStart.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
    });
    const left =
      ((bucketStart.getTime() - minDate.value.getTime()) / totalMs.value) *
      100;
    const width = (oneDay / totalMs.value) * 100;
    res.push({ left, width, label });
  }
  return res;
});

// mois : ligne1 mois, ligne2 semaines
const monthMonthBuckets = computed<Bucket[]>(() => {
  const res: Bucket[] = [];
  if (timeScale.value !== 'month') return res;
  const start = new Date(minDate.value);
  const end = new Date(maxDate.value);
  const oneDay = 24 * 60 * 60 * 1000;

  const d = new Date(start);
  d.setDate(1);
  while (d <= end) {
    const monthStart = new Date(d);
    const monthEnd = new Date(d);
    monthEnd.setMonth(monthEnd.getMonth() + 1, 0);

    const label = monthStart.toLocaleDateString('fr-FR', {
      month: 'short',
      year: '2-digit',
    });

    const left =
      ((monthStart.getTime() - minDate.value.getTime()) / totalMs.value) *
      100;
    const width =
      ((monthEnd.getTime() - monthStart.getTime() + oneDay) / totalMs.value) *
      100;

    res.push({ left, width, label });
    d.setMonth(d.getMonth() + 1, 1);
  }
  return res;
});

const monthWeekBuckets = computed<Bucket[]>(() => {
  const res: Bucket[] = [];
  if (timeScale.value !== 'month') return res;
  const start = new Date(minDate.value);
  const end = new Date(maxDate.value);
  const oneDay = 24 * 60 * 60 * 1000;

  let weekStart = new Date(start);
  while (weekStart <= end) {
    const weekEnd = new Date(weekStart.getTime() + 6 * oneDay);
    const weekNumber = getIsoWeekNumber(weekStart);
    const left =
      ((weekStart.getTime() - minDate.value.getTime()) / totalMs.value) * 100;
    const width =
      ((weekEnd.getTime() - weekStart.getTime() + oneDay) / totalMs.value) *
      100;
    res.push({ left, width, label: `S${weekNumber}` });
    weekStart = new Date(weekStart.getTime() + 7 * oneDay);
  }
  return res;
});

// trimestre : une seule ligne de mois
const quarterMonthBuckets = computed<Bucket[]>(() => {
  const res: Bucket[] = [];
  if (timeScale.value !== 'quarter') return res;
  const start = new Date(minDate.value);
  const end = new Date(maxDate.value);
  const oneDay = 24 * 60 * 60 * 1000;

  const d = new Date(start);
  d.setDate(1);
  while (d <= end) {
    const monthStart = new Date(d);
    const monthEnd = new Date(d);
    monthEnd.setMonth(monthEnd.getMonth() + 1, 0);

    const label = monthStart.toLocaleDateString('fr-FR', {
      month: 'short',
      year: '2-digit',
    });

    const left =
      ((monthStart.getTime() - minDate.value.getTime()) / totalMs.value) *
      100;
    const width =
      ((monthEnd.getTime() - monthStart.getTime() + oneDay) / totalMs.value) *
      100;

    res.push({ left, width, label });
    d.setMonth(d.getMonth() + 1, 1);
  }
  return res;
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

    <!-- Zone de droite -->
    <div class="gantt">
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
      </div>

      <!-- En-tête multi-niveaux -->
      <div class="gantt-header">
        <!-- Ligne 1 -->
        <div class="gantt-header-row">
          <template v-if="timeScale === 'week'">
            <div
              v-for="b in weekWeekBuckets"
              :key="'ww-' + b.left"
              class="gantt-header-cell"
              :style="{ left: b.left + '%', width: b.width + '%' }"
            >
              {{ b.label }}
            </div>
          </template>

          <template v-else-if="timeScale === 'month'">
            <div
              v-for="b in monthMonthBuckets"
              :key="'mm-' + b.left"
              class="gantt-header-cell"
              :style="{ left: b.left + '%', width: b.width + '%' }"
            >
              {{ b.label }}
            </div>
          </template>

          <template v-else>
            <div
              v-for="b in quarterMonthBuckets"
              :key="'qm-' + b.left"
              class="gantt-header-cell"
              :style="{ left: b.left + '%', width: b.width + '%' }"
            >
              {{ b.label }}
            </div>
          </template>
        </div>

        <!-- Ligne 2 -->
        <div class="gantt-header-row">
          <template v-if="timeScale === 'week'">
            <div
              v-for="b in weekDayBuckets"
              :key="'wd-' + b.left"
              class="gantt-header-cell"
              :style="{ left: b.left + '%', width: b.width + '%' }"
            >
              {{ b.label }}
            </div>
          </template>

          <template v-else-if="timeScale === 'month'">
            <div
              v-for="b in monthWeekBuckets"
              :key="'mw-' + b.left"
              class="gantt-header-cell"
              :style="{ left: b.left + '%', width: b.width + '%' }"
            >
              {{ b.label }}
            </div>
          </template>
        </div>
      </div>

      <!-- Corps -->
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

/* En-tête multi-lignes */
.gantt-header {
  position: relative;
  border-bottom: 1px solid #374151;
  background-color: #111827;
  color: #9ca3af;
  font-size: 10px;
}

.gantt-header-row {
  position: relative;
  height: 18px;
  border-bottom: 1px solid #111827;
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
