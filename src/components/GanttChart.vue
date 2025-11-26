<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Task } from '../gristBridge';

import GanttSidebar from './GanttSidebar.vue';
import GanttToolbar from './GanttToolbar.vue';

import { useGanttTasks } from '../composables/useGanttTasks';
import { useGanttTimeline } from '../composables/useGanttTimeline';
import { useGanttPopup } from '../composables/useGanttPopup';

const WIDGET_VERSION = 'V1.0.2';

const props = defineProps<{ tasks: Task[] }>();

// état global
const timeScale = ref<'week' | 'month' | 'quarter'>('month');
const dayStartHour = ref<number>(0);

// contexte d’édition Grist
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

  const table = grist.getTable();
  tableRef.value = table;

  grist.onRecords((_records: any[], mappings: any) => {
    if (mappings && mappings.columns && mappings.columns.editableCols) {
      const rawEditable = mappings.columns.editableCols;
      editableCols.value = Array.isArray(rawEditable) ? rawEditable : [];
    } else {
      editableCols.value = [];
    }
  });
}

// géométrie
const baseLaneHeight = 25;
const laneOuterGap = 5;
const subRowGap = 2.5;
const headerToFirstLaneGap = 5;

const toolbarHeight = 26;
const headerRowHeight = 25;

const headerHeight = computed(() => headerRowHeight * 3);
const lanesTopOffset = computed(
  () => toolbarHeight + headerHeight.value + headerToFirstLaneGap,
);

const offset = ref<number>(0);

// refs DOM + hauteurs label
const bodyRef = ref<HTMLDivElement | null>(null);
const sidebarRef = ref<InstanceType<typeof GanttSidebar> | null>(null);
const laneLabelHeights = ref<Record<number, number>>({});

// référence temps (simple) à partir des tâches brutes
const referenceDate = computed(() => {
  const withStart = props.tasks.filter((t) => t.start);
  if (!withStart.length) return new Date();
  return new Date(
    Math.min(
      ...withStart.map((t) => new Date(t.start as string).getTime()),
    ),
  );
});

// Timeline
const {
  minDate,
  maxDate,
  timeOfDayBuckets,
  weekWeekBuckets,
  weekDayBuckets,
  monthMonthBuckets,
  monthWeekBuckets,
  monthDayBuckets,
  quarterMonthBuckets,
  quarterWeekBuckets,
} = useGanttTimeline({
  timeScale,
  offset,
  referenceDateSource: () => referenceDate.value,
  dayStartHour,
});

// Tâches / lanes
const {
  lanes,
  laneHeightFor,
  laneTopPx,
  visibleTasks,
  leftPercentVisible,
  widthPercentVisible,
  topPx,
} = useGanttTasks(
  computed(() => props.tasks),
  laneLabelHeights,
  baseLaneHeight,
  laneOuterGap,
  subRowGap,
  minDate,
  maxDate,
);

// Popup
const {
  isPopupOpen,
  selectedTask,
  onTaskClick,
} = useGanttPopup();

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

// mesure labels + synchro scroll
async function recomputeLaneLabelHeights() {
  await Promise.resolve();
  if (
    sidebarRef.value &&
    typeof (sidebarRef.value as any).getLaneLabelHeights === 'function'
  ) {
    const heights: number[] = (sidebarRef.value as any).getLaneLabelHeights();
    const map: Record<number, number> = {};
    lanes.value.forEach((lane, i) => {
      map[lane.index] = heights[i] ?? baseLaneHeight;
    });
    laneLabelHeights.value = map;
  }
}

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
</script>

<template>
  <div class="gantt-wrapper">
    <!-- Zone haut-gauche : version -->
    <div class="gantt-top-left">
      <span class="gantt-version">{{ WIDGET_VERSION }}</span>
    </div>

    <!-- Partie droite : toolbar + header + body -->
    <div class="gantt-right">
      <GanttToolbar
        :time-scale="timeScale"
        @prev="goPrev"
        @next="goNext"
        @today="resetOffset"
        @change-scale="(s) => { timeScale = s; offset = 0; }"
      />

      <!-- Header multi-lignes -->
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

    <!-- Sidebar (colonne de gauche, sous la zone version) -->
    <GanttSidebar
      class="gantt-sidebar"
      ref="sidebarRef"
      :version="WIDGET_VERSION"
      :lanes="lanes"
      :lane-height="baseLaneHeight"
      :lane-gap="laneOuterGap"
      :lanes-top-offset="lanesTopOffset"
      :lane-top-fn="laneTopPx"
      :lane-height-fn="laneHeightFor"
    />
  </div>
</template>

<style scoped>
.gantt-wrapper {
  display: grid;
  grid-template-columns: 200px 1fr;
  grid-template-rows: auto 1fr; /* la 1re ligne prend la hauteur réelle (toolbar + header) */
  height: 100%;
  border: 1px solid #374151;
  background-color: #111827;
  overflow: hidden;
  color: #e5e7eb;
}

/* Zone haut-gauche (même ligne que toolbar+header) */
.gantt-top-left {
  grid-column: 1;
  grid-row: 1;
  height: 100px;
  background-color: #020617;
  border-right: 1px solid #374151;
  border-bottom: 1px solid #374151;
  display: flex;
  align-items: center;
  padding: 0 8px;
  box-sizing: border-box;
}

.gantt-version {
  font-size: 10px;
  color: #9ca3af;
}

/* Partie droite : occupe les 2 lignes (header + corps) */
.gantt-right {
  grid-column: 2;
  grid-row: 1 / span 2;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Sidebar en bas à gauche */
.gantt-sidebar {
  grid-column: 1;
  grid-row: 2;
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
  height: 24px;
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
