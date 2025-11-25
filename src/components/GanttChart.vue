<script setup lang="ts">
import { computed, ref, onMounted, nextTick, watch } from 'vue';
import type { Task } from '../gristBridge';

import GanttSidebar from './GanttSidebar.vue';
import GanttToolbar from './GanttToolbar.vue';

// Version du widget
const WIDGET_VERSION = 'V0.0.66';

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

  // on ne lit que mappings pour récupérer editableCols
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
const baseLaneHeight = 25;
const laneOuterGap = 5;
const subRowGap = 2.5;
const headerToFirstLaneGap = 5;

const toolbarHeight = 25;
const headerRowHeight = 25;

const headerHeight = computed(() => {
  if (timeScale.value === 'week') {
    return headerRowHeight * 3;
  }
  return headerRowHeight * 3;
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

// 3) Tâches avec laneIndex + subRowIndex
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

// nombre d’étages par lane
const laneRowCount = computed<Record<number, number>>(() => {
  const map: Record<number, number> = {};
  for (const t of tasksWithLane.value) {
    const current = map[t.laneIndex] ?? 0;
    const needed = t.subRowIndex + 1;
    if (needed > current) map[t.laneIndex] = needed;
  }
  return map;
});

// hauteur réelle d’une lane (max entre barres et label)
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

// top d’une barre
function topPx(task: TaskWithLane) {
  const laneTop = laneTopPx(task.laneIndex);
  const rowIndex = task.subRowIndex ?? 0;

  if (rowIndex === 0) {
    return laneTop;
  }
  return laneTop + rowIndex * (baseLaneHeight + subRowGap);
}

// 4) Dates / échelles (inchangé)
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

// Clamp des tâches
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

// --- buckets, navigation, etc. inchangés (omission volontaire pour ne pas alourdir) ---
// (garde exactement ton code existant pour weekWeekBuckets, monthWeekBuckets, etc.)

// fonction utilitaire: mesure des labels et mise à jour des hauteurs
async function recomputeLaneLabelHeights() {
  await nextTick();
  if (sidebarRef.value && typeof (sidebarRef.value as any).getLaneLabelHeights === 'function') {
    const heights: number[] = (sidebarRef.value as any).getLaneLabelHeights();
    const map: Record<number, number> = {};
    lanes.value.forEach((lane, i) => {
      map[lane.index] = Math.max(heights[i] ?? baseLaneHeight, baseLaneHeight);
    });
    laneLabelHeights.value = map;
  }
}

// centrage sur aujourd’hui + première mesure
onMounted(async () => {
  await recomputeLaneLabelHeights();
  // ... ton code existant de centrage sur today reste ici ...
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

// clic sur une barre => pop-up
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
        @prev="offset--"
        @next="offset++"
        @today="offset = 0"
        @change-scale="(s) => { timeScale = s; offset = 0; }"
      />

      <!-- Header (non modifié, garde ton code) -->

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

          <!-- Barres -->
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

      <!-- Pop-up tâche -->
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

/* le reste de ton CSS (header, body, popup, etc.) reste identique */
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
  height: 25px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.gantt-bar:hover {
  filter: brightness(1.1);
}

.gantt-label {
  font-size: 11px;
  color: white;
  padding: 2px 4px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* popup inchangé */
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
