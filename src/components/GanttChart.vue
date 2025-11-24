<!-- src/components/GanttChart.vue -->
<script setup lang="ts">
import { computed, ref, onMounted, nextTick } from 'vue';
import type { Task } from '../gristBridge';

const props = defineProps<{ tasks: Task[] }>();

const timeScale = ref<'week' | 'month' | 'quarter'>('month');
const dayStartHour = ref<number>(0);

const laneHeight = 24;
const laneGap = 4;
// hauteur totale de l’en-tête de droite: 2 lignes * 18px = 36
const headerRowHeight = 18;
const headerHeight = headerRowHeight * 2;

const offset = ref<number>(0);

const bodyRef = ref<HTMLDivElement | null>(null);
const sidebarRef = ref<HTMLDivElement | null>(null);

declare const grist: any;

if (typeof grist !== 'undefined') {
  grist.onOptions((options: any) => {
    if (options && typeof options.dayStartHour === 'number') {
      dayStartHour.value = options.dayStartHour;
    } else {
      dayStartHour.value = 0;
    }
  });
}

const parsedTasks = computed(() =>
  props.tasks
    .filter((t) => t.start && t.duration != null)
    .map((t) => {
      const startDate = new Date(t.start as string);
      const hours = Number(t.duration);
      const days = hours / 24;
      const endDate = new Date(
        startDate.getTime() + days * 24 * 60 * 60 * 1000,
      );
      return { ...t, startDate, endDate };
    }),
);

type Lane = {
  index: number;
  groupBy: string;
  groupBy2: string;
  label: string;
  isGroupHeader: boolean;
};

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
    result.push({
      index: nextIndex++,
      groupBy: g1,
      groupBy2: '',
      label: g1 || '—',
      isGroupHeader: true,
    });

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
  return headerHeight + laneGap + laneIndex * (laneHeight + laneGap);
}
function topPx(task: any) {
  return laneTopPx(task.laneIndex);
}

const referenceDate = computed(() => {
  if (!tasksWithLane.value.length) {
    return new Date();
  }
  return new Date(
    Math.min(...tasksWithLane.value.map((t) => t.startDate.getTime())),
  );
});

const baseMinDate = computed(() => {
  const d = new Date(referenceDate.value);

  if (timeScale.value === 'week') {
    const day = d.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  if (timeScale.value === 'month') {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const q = Math.floor(d.getMonth() / 3);
  const qStart = new Date(d.getFullYear(), q * 3, 1);
  qStart.setHours(0, 0, 0, 0);
  return qStart;
});

const baseMaxDate = computed(() => {
  const d = new Date(referenceDate.value);

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

  if (timeScale.value === 'month') {
    const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    lastDayOfMonth.setHours(23, 59, 59, 999);
    return lastDayOfMonth;
  }

  const q = Math.floor(d.getMonth() / 3);
  const qEnd = new Date(d.getFullYear(), q * 3 + 3, 0);
  qEnd.setHours(23, 59, 59, 999);
  return qEnd;
});

const minDate = computed(() => {
  const k = offset.value;

  if (timeScale.value === 'week') {
    const d = new Date(baseMinDate.value);
    d.setDate(d.getDate() + k * 7);
    return d;
  }

  if (timeScale.value === 'month') {
    const ref = new Date(referenceDate.value);
    ref.setMonth(ref.getMonth() + k, 1);
    ref.setHours(0, 0, 0, 0);
    return ref;
  }

  const d = new Date(baseMinDate.value);
  d.setMonth(d.getMonth() + k * 3);
  const day = d.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
});

const maxDate = computed(() => {
  const k = offset.value;

  if (timeScale.value === 'week') {
    const d = new Date(baseMaxDate.value);
    d.setDate(d.getDate() + k * 7);
    return d;
  }

  if (timeScale.value === 'month') {
    const ref = new Date(referenceDate.value);
    ref.setMonth(ref.getMonth() + k + 1, 0);
    ref.setHours(23, 59, 59, 999);
    return ref;
  }

  const d = new Date(baseMaxDate.value);
  d.setMonth(d.getMonth() + k * 3);
  const day = d.getDay();
  const diffToSunday = 7 - (day === 0 ? 7 : day);
  d.setDate(d.getDate() + diffToSunday);
  d.setHours(23, 59, 59, 999);
  return d;
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

function getIsoWeekNumber(date: Date): number {
  const tmp = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDay() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+tmp - +yearStart) / 86400000 + 1) / 7);
  return weekNo;
}

type Bucket = { left: number; width: number; label: string; date?: Date };

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
    res.push({ left, width, label, date: bucketStart });
  }
  return res;
});

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

function goPrev() {
  offset.value -= 1;
}
function goNext() {
  offset.value += 1;
}
function resetOffset() {
  offset.value = 0;
}

onMounted(async () => {
  await nextTick();

  const body = bodyRef.value;
  if (!body) return;

  const gantt = body.closest('.gantt');
  if (!gantt) return;

  const header = gantt.querySelector('.gantt-header');
  if (!header) return;

  const todayCell = header.querySelector(
    '.gantt-header-cell.is-today',
  ) as HTMLElement | null;
  if (!todayCell) return;

  const bodyRect = body.getBoundingClientRect();
  const cellRect = todayCell.getBoundingClientRect();

  const offsetLeft = cellRect.left - bodyRect.left + body.scrollLeft;
  body.scrollLeft =
    offsetLeft - body.clientWidth / 2 + todayCell.offsetWidth / 2;
});

function onBodyScroll(e: Event) {
  const body = e.target as HTMLDivElement;
  if (sidebarRef.value) {
    sidebarRef.value.scrollTop = body.scrollTop;
  }
}
</script>

<template>
  <div class="gantt-wrapper">
    <!-- Colonne de gauche -->
    <div class="gantt-sidebar" ref="sidebarRef">
      <!-- Faux header gauche, 2 lignes de rectangles comme la timeline -->
      <div class="gantt-sidebar-header">
        <div class="gantt-sidebar-header-row"></div>
        <div class="gantt-sidebar-header-row"></div>
      </div>

      <div v-if="!lanes.length" class="gantt-empty">
        Aucune tâche
      </div>
      <div v-else class="gantt-sidebar-inner">
        <div
          v-for="lane in lanes"
          :key="'sbg-' + lane.index"
          class="gantt-lane-bg-sidebar"
          :style="{
            top: laneTopPx(lane.index) + 'px',
            height: laneHeight + 'px'
          }"
        ></div>

        <div
          v-for="lane in lanes"
          :key="lane.index"
          class="gantt-lane-label"
          :class="{
            'gantt-lane-group': lane.isGroupHeader,
            'gantt-lane-sub': !lane.isGroupHeader,
          }"
          :style="{
            top: laneTopPx(lane.index) + 'px',
            height: laneHeight + 'px'
          }"
        >
          {{ lane.label || '—' }}
        </div>
      </div>
    </div>

    <!-- Zone de droite -->
    <div class="gantt">
      <div class="gantt-toolbar">
        <button class="gantt-btn" @click="goPrev">◀</button>
        <button class="gantt-btn" @click="resetOffset">Aujourd'hui</button>
        <button class="gantt-btn" @click="goNext">▶</button>

        <div class="gantt-toolbar-sep" />

        <button
          class="gantt-btn"
          :class="{ 'is-active': timeScale === 'week' }"
          @click="timeScale = 'week'; offset = 0"
        >
          Semaine
        </button>
        <button
          class="gantt-btn"
          :class="{ 'is-active': timeScale === 'month' }"
          @click="timeScale = 'month'; offset = 0"
        >
          Mois
        </button>
        <button
          class="gantt-btn"
          :class="{ 'is-active': timeScale === 'quarter' }"
          @click="timeScale = 'quarter'; offset = 0"
        >
          Trimestre
        </button>
      </div>

      <div class="gantt-header">
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

        <div class="gantt-header-row">
          <template v-if="timeScale === 'week'">
            <div
              v-for="b in weekDayBuckets"
              :key="'wd-' + b.left"
              class="gantt-header-cell"
              :class="{
                'is-today':
                  b.date &&
                  b.date.toDateString() === new Date().toDateString(),
              }"
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

      <div class="gantt-body" ref="bodyRef" @scroll="onBodyScroll">
        <div v-if="!tasksWithLane.length" class="gantt-empty">
          Aucune tâche à afficher
        </div>
        <div v-else class="gantt-body-inner">
          <div
            v-for="lane in lanes"
            :key="'bg-' + lane.index"
            class="gantt-lane-bg"
            :style="{
              top: laneTopPx(lane.index) + 'px',
              height: laneHeight + 'px'
            }"
          ></div>

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
  grid-template-columns: 200px 1fr;
  height: 400px;
  border: 1px solid #374151;
  background-color: #111827;
  overflow: hidden;
  color: #e5e7eb;
}

.gantt-sidebar {
  position: relative;
  border-right: 1px solid #374151;
  overflow: hidden;
}

/* Fausse zone d’en-tête à gauche, 2 lignes comme la timeline */
.gantt-sidebar-header {
  height: 36px; /* 2 * 18px */
  border-bottom: 1px solid #374151;
  background-color: #111827;
}

.gantt-sidebar-header-row {
  height: 18px;
  border-bottom: 1px solid #111827;
  background-color: #020617;
}

.gantt-sidebar-inner {
  position: relative;
  min-height: 100%;
}

.gantt-lane-bg-sidebar {
  position: absolute;
  left: 0;
  right: 0;
  background-color: #020617;
  border-top: 1px solid #111827;
  z-index: 0;
}

.gantt-lane-label {
  position: absolute;
  display: flex;
  align-items: center;
  font-size: 12px;
  white-space: nowrap;
  padding-left: 8px;
  z-index: 1;
}

.gantt-lane-group {
  font-weight: 600;
  color: #f9fafb;
}

.gantt-lane-sub {
  padding-left: 20px;
  font-size: 11px;
  color: #d1d5db;
}

.gantt {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.gantt-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-bottom: 1px solid #374151;
  background-color: #020617;
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

.gantt-header-cell.is-today {
  background-color: #1d4ed8;
  color: #f9fafb;
  font-weight: 600;
}

.gantt-body {
  position: relative;
  flex: 1;
  overflow: auto;
}

.gantt-body-inner {
  position: relative;
  min-height: 100%;
}

.gantt-lane-bg {
  position: absolute;
  left: 0;
  right: 0;
  background-color: #020617;
  border-top: 1px solid #111827;
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
