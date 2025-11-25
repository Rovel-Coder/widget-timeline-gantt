<script setup lang="ts">
import { computed, ref, onMounted, nextTick, watch } from 'vue';
import type { Task } from '../gristBridge';

import GanttSidebar from './GanttSidebar.vue';
import GanttToolbar from './GanttToolbar.vue';

// Version du widget
const WIDGET_VERSION = 'V0.0.70';

const props = defineProps<{ tasks: Task[] }>();

const timeScale = ref<'week' | 'month' | 'quarter'>('month');
const dayStartHour = ref<number>(0);

// contexte d’édition
const editableCols = ref<string[]>([]);
const tableRef = ref<any | null>(null);

declare const grist: any;

if (typeof grist !== 'undefined') {
  grist.onOptions((options: any) => {
    if (options && typeof options.dayStartHour === 'number') {
      dayStartHour.value = options.dayStartHour;
    } else {
      dayStartHour.value = 0;
    }
  });

  // table utilisée pour les updates
  const table = grist.getTable();
  tableRef.value = table;

  // on ne lit que mappings pour récupérer editableCols (records est inutile ici)
  grist.onRecords((_records: any[], mappings: any) => {
    if (mappings && mappings.columns && mappings.columns.editableCols) {
      const rawEditable = mappings.columns.editableCols;
      editableCols.value = Array.isArray(rawEditable) ? rawEditable : [];
    } else {
      editableCols.value = [];
    }
  });
}

// --- Types internes ---
type ParsedTask = Task & {
  startDate: Date;
  endDate: Date;
};

type Lane = {
  index: number;
  groupBy: string;
  groupBy2: string;
  label: string;
  isGroupHeader: boolean;
};

// géométrie
const baseLaneHeight = 25;              // hauteur d'un étage
const laneOuterGap = 5;                 // espace entre 2 lanes
const subRowGap = 2.5;                  // espace interne entre étages
const headerToFirstLaneGap = 5;         // entre header et 1re lane

const toolbarHeight = 25;
const headerRowHeight = 25;

const headerHeight = computed(() => {
  if (timeScale.value === 'week') {
    return headerRowHeight * 3; // Semaine / Jour / Créneaux
  }
  return headerRowHeight * 3;   // Mois / Trimestre
});

const lanesTopOffset = computed(() => {
  return toolbarHeight + headerHeight.value + headerToFirstLaneGap;
});

const offset = ref<number>(0);

const bodyRef = ref<HTMLDivElement | null>(null);
const sidebarRef = ref<InstanceType<typeof GanttSidebar> | null>(null);

// hauteurs réelles des labels de lanes
const laneLabelHeights = ref<Record<number, number>>({});

// pop-up tâche
const isPopupOpen = ref(false);
type TaskWithLaneForPopup = ParsedTask & { laneIndex: number; subRowIndex: number };
const selectedTask = ref<TaskWithLaneForPopup | null>(null);

// 1) Tâches avec dates JS
const parsedTasks = computed<ParsedTask[]>(() =>
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

// 2) Lanes hiérarchiques
const lanes = computed<Lane[]>(() => {
  const result: Lane[] = [];
  let nextIndex = 0;

  const byGroup = new Map<string, ParsedTask[]>();
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

// 3) Tâches avec laneIndex + subRowIndex (empilement)
type TaskWithLane = ParsedTask & {
  laneIndex: number;
  subRowIndex: number;
};

const tasksWithLane = computed<TaskWithLane[]>(() => {
  const byKey = new Map<string, number>();
  for (const lane of lanes.value) {
    const key = `${lane.groupBy}||${lane.groupBy2}`;
    byKey.set(key, lane.index);
  }

  const base: TaskWithLane[] = parsedTasks.value.map((t) => {
    const g1 = (t.groupBy ?? '').toString();
    const g2 = (t.groupBy2 ?? '').toString();
    const key = `${g1}||${g2}`;
    const laneIndex = byKey.get(key) ?? 0;
    return { ...t, laneIndex, subRowIndex: 0 };
  });

  const result: TaskWithLane[] = [];
  const byLane = new Map<number, TaskWithLane[]>();

  for (const t of base) {
    if (!byLane.has(t.laneIndex)) byLane.set(t.laneIndex, []);
    byLane.get(t.laneIndex)!.push(t);
  }

  for (const [, tasks] of byLane.entries()) {
    const sorted = [...tasks].sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime(),
    );

    const rows: { tasks: { start: number; end: number }[] }[] = [];

    for (const t of sorted) {
      const start = t.startDate.getTime();
      const end = t.endDate.getTime();

      let placed = false;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.tasks.length === 0) continue;
        const last = row.tasks[row.tasks.length - 1];
        if (!last) continue;

        if (start >= last.end) {
          row.tasks.push({ start, end });
          result.push({ ...t, subRowIndex: i });
          placed = true;
          break;
        }
      }

      if (!placed) {
        const newRow = { tasks: [{ start, end }] };
        rows.push(newRow);
        const newIndex = rows.length - 1;
        result.push({ ...t, subRowIndex: newIndex });
      }
    }
  }

  return result;
});

// nombre d’étages (rows) par lane
const laneRowCount = computed<Record<number, number>>(() => {
  const map: Record<number, number> = {};
  for (const t of tasksWithLane.value) {
    const current = map[t.laneIndex] ?? 0;
    const needed = t.subRowIndex + 1;
    if (needed > current) map[t.laneIndex] = needed;
  }
  return map;
});

// hauteur réelle d’une lane (tous les étages + label wrap)
function laneHeightFor(laneIndex: number): number {
  const rows = laneRowCount.value[laneIndex] ?? 1;
  const barsHeight =
    rows <= 1 ? baseLaneHeight : rows * baseLaneHeight + (rows - 1) * subRowGap;

  const labelHeight = laneLabelHeights.value[laneIndex] ?? baseLaneHeight;
  return Math.max(barsHeight, labelHeight);
}

// top d’une lane (somme des hauteurs précédentes + gaps externes)
function laneTopPx(laneIndex: number) {
  let top = 10;
  for (let i = 0; i < laneIndex; i++) {
    top += laneHeightFor(i) + laneOuterGap;
  }
  return top;
}

// top d’une barre (empilement interne)
function topPx(task: TaskWithLane) {
  const laneTop = laneTopPx(task.laneIndex);
  const rowIndex = task.subRowIndex ?? 0;

  if (rowIndex === 0) {
    return laneTop;
  }
  return laneTop + rowIndex * (baseLaneHeight + subRowGap);
}

// 4) Dates / échelles
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

// Clamp des tâches sur la plage visible
type VisibleTask = TaskWithLane & {
  visibleStart: Date;
  visibleEnd: Date;
};

const visibleTasks = computed<VisibleTask[]>(() => {
  const startView = minDate.value.getTime();
  const endView = maxDate.value.getTime();

  return tasksWithLane.value
    .map((t) => {
      const taskStart = t.startDate.getTime();
      const taskEnd = t.endDate.getTime();

      if (taskEnd <= startView || taskStart >= endView) {
        return null;
      }

      const visibleStartMs = Math.max(taskStart, startView);
      const visibleEndMs = Math.min(taskEnd, endView);

      return {
        ...t,
        visibleStart: new Date(visibleStartMs),
        visibleEnd: new Date(visibleEndMs),
      };
    })
    .filter((t): t is VisibleTask => t !== null);
});

function leftPercentVisible(task: VisibleTask) {
  return (
    ((task.visibleStart.getTime() - minDate.value.getTime()) /
      totalMs.value) *
    100
  );
}
function widthPercentVisible(task: VisibleTask) {
  return (
    ((task.visibleEnd.getTime() - task.visibleStart.getTime()) /
      totalMs.value) *
    100
  );
}

// numéro de semaine ISO
function getIsoWeekNumber(date: Date): number {
  const tmp = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return weekNo;
}

type Bucket = { left: number; width: number; label: string; date?: Date };

// Buckets pour les 3 coupures de la journée (vue Semaine)
type TimeOfDayBucket = Bucket & { slot: 'morning' | 'afternoon' | 'night' };

const timeOfDayBuckets = computed<TimeOfDayBucket[]>(() => {
  const res: TimeOfDayBucket[] = [];
  if (timeScale.value !== 'week') return res;

  const start = new Date(minDate.value);
  const end = new Date(maxDate.value);
  const oneDay = 24 * 60 * 60 * 1000;

  for (let ts = start.getTime(); ts <= end.getTime(); ts += oneDay) {
    const dayStart = new Date(ts);

    const mStart = new Date(dayStart);
    mStart.setHours(8, 0, 0, 0);
    const mEnd = new Date(dayStart);
    mEnd.setHours(14, 0, 0, 0);

    const aStart = new Date(dayStart);
    aStart.setHours(14, 0, 0, 0);
    const aEnd = new Date(dayStart);
    aEnd.setHours(20, 0, 0, 0);

    const nStart = new Date(dayStart);
    nStart.setHours(20, 0, 0, 0);
    const nEnd = new Date(dayStart.getTime() + oneDay);
    nEnd.setHours(8, 0, 0, 0);

    const addBucket = (
      slot: TimeOfDayBucket['slot'],
      bStart: Date,
      bEnd: Date,
      label: string,
    ) => {
      const left =
        ((bStart.getTime() - minDate.value.getTime()) / totalMs.value) * 100;
      const width =
        ((bEnd.getTime() - bStart.getTime()) / totalMs.value) * 100;
      res.push({ left, width, label, slot });
    };

    addBucket('morning', mStart, mEnd, 'Matin');
    addBucket('afternoon', aStart, aEnd, 'Après‑midi');
    addBucket('night', nStart, nEnd, 'Nuit');
  }

  return res;
});

// Semaine (ligne 1 - vue semaine)
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

// Jours pour la vue Semaine (ligne 2)
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

// Mois (ligne 1 - vue mois)
const monthMonthBuckets = computed<Bucket[]>(() => {
  const res: Bucket[] = [];
  if (timeScale.value !== 'month' && timeScale.value !== 'quarter') return res;
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

// Semaines (ligne 2 - vue mois)
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

// Jours (ligne 3 - vue mois)
const monthDayBuckets = computed<Bucket[]>(() => {
  const res: Bucket[] = [];
  if (timeScale.value !== 'month') return res;

  const start = new Date(minDate.value);
  const end = new Date(maxDate.value);
  const oneDay = 24 * 60 * 60 * 1000;

  for (let ts = start.getTime(); ts <= end.getTime(); ts += oneDay) {
    const d = new Date(ts);
    const label = d.toLocaleDateString('fr-FR', { day: '2-digit' });
    const left =
      ((d.getTime() - minDate.value.getTime()) / totalMs.value) * 100;
    const width = (oneDay / totalMs.value) * 100;
    res.push({ left, width, label, date: d });
  }
  return res;
});

// Trimestre (ligne 1 - vue trimestre) = regroupement de 3 mois
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

    const label = monthStart.toLocaleDateString('fr-FR', { month: 'short' });

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

// Semaines (ligne 3 - vue trimestre)
const quarterWeekBuckets = computed<Bucket[]>(() => {
  const res: Bucket[] = [];
  if (timeScale.value !== 'quarter') return res;

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

// Navigation
function goPrev() {
  offset.value -= 1;
}
function goNext() {
  offset.value += 1;
}
function resetOffset() {
  offset.value = 0;
}

// fonction utilitaire: mesure des labels et mise à jour des hauteurs
async function recomputeLaneLabelHeights() {
  await nextTick();
  if (sidebarRef.value && typeof (sidebarRef.value as any).getLaneLabelHeights === 'function') {
    const heights: number[] = (sidebarRef.value as any).getLaneLabelHeights();
    const map: Record<number, number> = {};
    lanes.value.forEach((lane, i) => {
      map[lane.index] = heights[i] ?? baseLaneHeight;
    });
    laneLabelHeights.value = map;
  }
}

// centrage sur aujourd’hui + première mesure
onMounted(async () => {
  await recomputeLaneLabelHeights();

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

// remesure chaque fois que les lanes changent (nouvelles données, etc.)
watch(lanes, () => {
  recomputeLaneLabelHeights();
});

function onBodyScroll(e: Event) {
  const body = e.target as HTMLDivElement;
  if (sidebarRef.value) {
    const sidebarEl = (sidebarRef.value as any).$el as HTMLElement;
    if (sidebarEl) {
      sidebarEl.scrollTop = body.scrollTop;
    }
  }
}

// --- clic sur une barre => pop-up ---
async function onTaskClick(task: TaskWithLane) {
  selectedTask.value = task;
  isPopupOpen.value = true;
}
</script>

<template>
  <div class="gantt-wrapper">
    <!-- Colonne de gauche -->
    <GanttSidebar
      ref="sidebarRef"
      :version="WIDGET_VERSION"
      :lanes="lanes"
      :lane-height="baseLaneHeight"
      :lane-gap="laneOuterGap"
      :lanes-top-offset="lanesTopOffset"
      :lane-top-fn="laneTopPx"
      :lane-height-fn="laneHeightFor"
    />

    <!-- Zone de droite -->
    <div class="gantt">
      <GanttToolbar
        :time-scale="timeScale"
        @prev="goPrev"
        @next="goNext"
        @today="resetOffset"
        @change-scale="(s) => { timeScale = s; offset = 0; }"
      />

      <!-- Header multi-lignes (3 x 25px) -->
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

          <template v-else>
            <div
              v-for="b in monthMonthBuckets"
              :key="'q2m-' + b.left"
              class="gantt-header-cell"
              :style="{ left: b.left + '%', width: b.width + '%' }"
            >
              {{ b.label }}
            </div>
          </template>
        </div>

        <!-- Ligne 3 -->
        <div class="gantt-header-row">
          <template v-if="timeScale === 'week'">
            <div
              v-for="b in timeOfDayBuckets"
              :key="'tod-' + b.left + '-' + b.slot"
              class="gantt-header-cell gantt-header-cell-tod"
              :style="{ left: b.left + '%', width: b.width + '%' }"
            >
              {{ b.label }}
            </div>
          </template>

          <template v-else-if="timeScale === 'month'">
            <div
              v-for="b in monthDayBuckets"
              :key="'md-' + b.left"
              class="gantt-header-cell"
              :style="{ left: b.left + '%', width: b.width + '%' }"
            >
              {{ b.label }}
            </div>
          </template>

          <template v-else>
            <div
              v-for="b in quarterWeekBuckets"
              :key="'qw-' + b.left"
              class="gantt-header-cell"
              :style="{ left: b.left + '%', width: b.width + '%' }"
            >
              {{ b.label }}
            </div>
          </template>
        </div>
      </div>

      <!-- Corps -->
      <div class="gantt-body" ref="bodyRef" @scroll="onBodyScroll">
        <div v-if="!visibleTasks.length" class="gantt-empty">
          Aucune tâche à afficher
        </div>
        <div v-else class="gantt-body-inner">
          <!-- fond des lanes -->
          <div
            v-for="lane in lanes"
            :key="'bg-' + lane.index"
            class="gantt-lane-bg"
            :style="{
              top: laneTopPx(lane.index) + 'px',
              height: laneHeightFor(lane.index) + 'px'
            }"
          ></div>

          <!-- Barres de tâches -->
          <div
            v-for="task in visibleTasks"
            :key="task.id"
            class="gantt-bar"
            :style="{
              top: topPx(task) + 'px',
              left: leftPercentVisible(task) + '%',
              width: widthPercentVisible(task) + '%',
              backgroundColor: task.color || '#4caf50',
            }"
            @click="onTaskClick(task)"
          >
            <span class="gantt-label">
              {{ task.name || 'Tâche' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Pop-up d’info tâche -->
      <div
        v-if="isPopupOpen && selectedTask"
        class="gantt-task-popup"
        @click.self="isPopupOpen = false"
      >
        <div class="gantt-task-popup-inner">
          <div class="gantt-task-popup-title">
            {{ selectedTask.name || 'Tâche' }}
          </div>
          <div class="gantt-task-popup-row">
            Début : {{ selectedTask.startDate.toLocaleString('fr-FR') }}
          </div>
          <div class="gantt-task-popup-row">
            Durée : {{ selectedTask.duration }} h
          </div>
          <div
            class="gantt-task-popup-row"
            v-if="selectedTask.comment"
          >
            Commentaire : {{ selectedTask.comment }}
          </div>

          <button
            class="gantt-task-popup-close"
            @click="isPopupOpen = false"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gantt-wrapper {
  display: grid;
  grid-template-columns: 150px 1fr;
  min-height: 400px;
  border: 1px solid #374151;
  background-color: #111827;
  overflow: hidden;
  color: #e5e7eb;
}

.gantt {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Header */
.gantt-header {
  position: relative;
  border-bottom: 1px solid #374151;
  background-color: #111827;
  color: #9ca3af;
  font-size: 10px;
}

.gantt-header-row {
  position: relative;
  height: 25px;
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

/* 3e ligne : Matin / Après-midi / Nuit */
.gantt-header-cell-tod {
  font-size: 9px;
  opacity: 0.8;
}

.gantt-header-cell-tod:nth-child(3n + 1) {
  background-color: rgba(37, 99, 235, 0.08);
}
.gantt-header-cell-tod:nth-child(3n + 2) {
  background-color: rgba(16, 185, 129, 0.08);
}
.gantt-header-cell-tod:nth-child(3n + 3) {
  background-color: rgba(234, 179, 8, 0.08);
}

/* Corps */
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
  height: 100%;
  border-radius: 4px;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.gantt-bar:hover {
  filter: brightness(1.1);
}

/* Titre de tâche tronqué dans la barre */
.gantt-label {
  font-size: 11px;
  color: white;
  padding: 2px 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Pop-up tâche */
.gantt-task-popup {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.gantt-task-popup-inner {
  min-width: 260px;
  max-width: 360px;
  background: #020617;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  color: #e5e7eb;
}

.gantt-task-popup-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.gantt-task-popup-row {
  margin-bottom: 4px;
}

.gantt-task-popup-close {
  margin-top: 8px;
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid #4b5563;
  background: #111827;
  color: #e5e7eb;
  cursor: pointer;
}
</style>
