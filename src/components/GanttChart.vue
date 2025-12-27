<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import type { Task } from '../gristBridge';
import GanttSidebar from './GanttSidebar.vue';
import GanttToolbar from './GanttToolbar.vue';
import { useGanttTasks } from '../composables/useGanttTasks';
import { useGanttTimeline } from '../composables/useGanttTimeline';
import { useGanttPopup } from '../composables/useGanttPopup';

const WIDGET_VERSION = 'Version 1.0.1';

// Lundi de la semaine ISO 1 de 2025 pour P4S.[web:114][web:128]
const P4S_BASE = new Date(2024, 11, 30);
P4S_BASE.setHours(0, 0, 0, 0);

// 🛡️ FONCTION DE SANITIZATION GLOBALE (CRITIQUE XSS)
const sanitize = (value: any): string => {
  if (typeof value !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
};

const props = defineProps<{ tasks: Task[] }>();

// état global
const timeScale = ref<'week' | 'month' | 'quarter' | 'p4s'>('month');
const dayStartHour = ref<number>(0);

// contexte d'édition Grist
const editableCols = ref<string[]>([]);
const tableRef = ref<any | null>(null);
declare const grist: any;

if (typeof grist !== 'undefined') {
  grist.onOptions((options: any) => {
    if (options && typeof options.dayStartHour === 'number') {
      dayStartHour.value = Math.max(0, Math.min(23, options.dayStartHour));
    } else {
      dayStartHour.value = 0;
    }
  });

  const table = grist.getTable();
  tableRef.value = table;

  grist.onRecords((_records: any[], mappings: any) => {
    if (mappings?.columns?.editableCols) {
      const rawEditable = mappings.columns.editableCols;
      editableCols.value = Array.isArray(rawEditable)
        ? rawEditable.filter(
            (col: string) =>
              typeof col === 'string' &&
              col.length > 0 &&
              col.length < 100,
          )
        : [];
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

// refs DOM
const bodyRef = ref<HTMLDivElement | null>(null);
const sidebarRef = ref<InstanceType<typeof GanttSidebar> | null>(null);
const laneLabelHeights = ref<Record<number, number>>({});

// 🛡️ INTERFACE SafeTask compatible Task (pour TypeScript strict)
interface SafeTask {
  id: number;
  name: string;
  comment: string;
  start: Date;
  duration: number;
  color: string;
  groupBy?: string | null;
  groupBy2?: string | null;
  isLocked?: boolean | null;
  isGlobal?: boolean | null;
  content?: string;
}

// 🛡️ TÂCHES SANITISÉES ET VALIDÉES TypeScript
const safeTasks = computed((): SafeTask[] => {
  return props.tasks
    .map((task): SafeTask | null => {
      // ID obligatoire
      const id = Number(task.id);
      if (isNaN(id)) return null;

      // Date valide obligatoire (string ou Date)
      let startDate: Date | null = null;
      if (task.start instanceof Date) {
        startDate = task.start;
      } else if (typeof task.start === 'string') {
        const d = new Date(task.start);
        if (!isNaN(d.getTime())) startDate = d;
      }
      if (!startDate) return null;

      return {
        id,
        name: sanitize(task.name ?? 'Tâche sans nom'),
        comment: sanitize(task.comment ?? ''),
        start: startDate,
        duration: Math.max(0.5, Math.min(1000, Number(task.duration) || 1)),
        color:
          task.color && /^#?[0-9A-Fa-f]{3,8}$/.test(task.color)
            ? task.color
            : '#4caf50',
        groupBy: task.groupBy ? sanitize(task.groupBy) : null,
        groupBy2: task.groupBy2 ? sanitize(task.groupBy2) : null,
        isLocked: Boolean(task.isLocked),
        isGlobal: Boolean(task.isGlobal),
        content: task.content ? sanitize(task.content) : undefined,
      };
    })
    .filter((task): task is SafeTask => task !== null);
});

const referenceDate = computed(() => {
  const withStart = safeTasks.value.filter(
    (t) => t.start && !isNaN(t.start.getTime()),
  );
  if (!withStart.length) return new Date();
  return new Date(Math.min(...withStart.map((t) => t.start.getTime())));
});

// Timeline
const {
  baseMinDate,
  baseMaxDate,
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
  safeTasks as any, // SafeTask est compatible avec Task
  laneLabelHeights,
  baseLaneHeight,
  laneOuterGap,
  subRowGap,
  minDate,
  maxDate,
);

// Popup (+ édition Grist)
const {
  isPopupOpen,
  selectedTask,
  onTaskClick,
  updateRecordInGrist,
  localTask,
} = useGanttPopup({ tableRef, editableCols });

// Navigation
function goPrev() {
  if (timeScale.value === 'p4s') {
    // une période P4S = 4 semaines complètes
    offset.value = offset.value - 4;
  } else {
    offset.value = Math.max(-50, offset.value - 1);
  }
}

function goNext() {
  if (timeScale.value === 'p4s') {
    offset.value = offset.value + 4;
  } else {
    offset.value += 1;
  }
}

async function goToToday() {
  // on retourne en vue semaine centrée sur aujourd'hui
  timeScale.value = 'week';
  const base = new Date(baseMinDate.value);
  const now = new Date();
  base.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffMs = now.getTime() - base.getTime();
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  offset.value = Math.max(-50, Math.floor(diffMs / oneWeekMs));

  await nextTick();
  if (bodyRef.value) {
    bodyRef.value.scrollTop = 0;
  }
  if (sidebarRef.value) {
    const sidebarEl = (sidebarRef.value as any)?.$el as HTMLElement;
    if (sidebarEl) {
      sidebarEl.scrollTop = 0;
    }
  }
}

/**
 * Au changement de vue :
 * - on met à jour timeScale
 * - on recalcule un offset tel que la période courante contienne "aujourd'hui"
 *   avec une base fixe pour P4S (lundi semaine 1).[web:73][web:114]
 */
function changeScale(newScale: 'week' | 'month' | 'quarter' | 'p4s') {
  timeScale.value = newScale;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

  // On force le recalcul des bornes de base avec le nouveau timeScale
  const start0 = new Date(
    newScale === 'p4s' ? P4S_BASE : baseMinDate.value,
  );
  const end0 = new Date(
    newScale === 'p4s' ? new Date(P4S_BASE.getTime() + 27 * oneWeekMs / 4) : baseMaxDate.value,
  );
  start0.setHours(0, 0, 0, 0);
  end0.setHours(23, 59, 59, 999);

  if (newScale === 'week') {
    const diffMs = today.getTime() - start0.getTime();
    const kWeek = Math.floor(diffMs / oneWeekMs);
    offset.value = kWeek;
    return;
  }

  if (newScale === 'p4s') {
    // nombre de semaines écoulées depuis P4S_BASE.
    const diffWeeks = Math.floor((today.getTime() - P4S_BASE.getTime()) / oneWeekMs);
    // index de bloc de 4 semaines contenant today.
    const blockIndex = Math.floor(diffWeeks / 4);
    offset.value = blockIndex * 4;
    return;
  }

  if (newScale === 'month') {
    const baseYear = start0.getFullYear();
    const baseMonth = start0.getMonth();
    const year = today.getFullYear();
    const month = today.getMonth();
    offset.value = (year - baseYear) * 12 + (month - baseMonth);
    return;
  }

  if (newScale === 'quarter') {
    const baseYear = start0.getFullYear();
    const baseQuarter = Math.floor(start0.getMonth() / 3);
    const year = today.getFullYear();
    const quarter = Math.floor(today.getMonth() / 3);
    offset.value = (year - baseYear) * 4 + (quarter - baseQuarter);
    return;
  }
}

// mesure labels + synchro scroll
async function recomputeLaneLabelHeights() {
  await nextTick();
  if (
    sidebarRef.value &&
    typeof (sidebarRef.value as any).getLaneLabelHeights === 'function'
  ) {
    const heights: number[] = (sidebarRef.value as any).getLaneLabelHeights();
    const map: Record<number, number> = {};
    lanes.value.forEach((lane, i) => {
      map[lane.index] = Math.max(baseLaneHeight, heights[i] ?? baseLaneHeight);
    });
    laneLabelHeights.value = map;
  }
}

watch(lanes, recomputeLaneLabelHeights, { flush: 'post' });

function onBodyScroll(e: Event) {
  const body = e.target as HTMLDivElement;
  if (sidebarRef.value) {
    const sidebarEl = (sidebarRef.value as any)?.$el as HTMLElement;
    if (sidebarEl) {
      sidebarEl.scrollTop = body.scrollTop;
    }
  }
}
</script>



<template>
  <div class="gantt-wrapper">
    <!-- Zone haut-gauche : version SÉCURISÉE -->
    <div class="gantt-top-left">
      <span class="gantt-version">{{ WIDGET_VERSION }}</span>
    </div>

    <!-- Partie droite : toolbar + header + body -->
    <div class="gantt-right">
      <!-- Toolbar de navigation -->
      <GanttToolbar
        :time-scale="timeScale"
        @prev="goPrev"
        @next="goNext"
        @today="goToToday"
        @change-scale="changeScale"
      />

      <!-- Header multi-lignes SÉCURISÉ -->
      <div class="gantt-header">
        <!-- Ligne 1 : Semaines/Mois/Trimestres -->
        <div class="gantt-header-row">
          <template v-if="timeScale === 'week' || timeScale === 'p4s'">
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

        <!-- Ligne 2 : Jours/Semaines -->
        <div class="gantt-header-row">
          <template v-if="timeScale === 'week' || timeScale === 'p4s'">
            <div
              v-for="b in weekDayBuckets"
              :key="'wd-' + b.left"
              class="gantt-header-cell"
              :class="{
                'is-today':
                  b.date && b.date.toDateString() === new Date().toDateString()
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

        <!-- Ligne 3 : Heures/Jours -->
        <div class="gantt-header-row">
          <template v-if="timeScale === 'week' || timeScale === 'p4s'">
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

      <!-- Corps principal SÉCURISÉ -->
      <div class="gantt-body" ref="bodyRef" @scroll="onBodyScroll">
        <div v-if="!visibleTasks.length" class="gantt-empty">
          Aucune tâche à afficher
        </div>

        <div v-else class="gantt-body-inner">
          <!-- Fond des lanes -->
          <div
            v-for="lane in lanes"
            :key="'bg-' + lane.index"
            class="gantt-lane-bg"
            :style="{
              top: laneTopPx(lane.index) + 'px',
              height: laneHeightFor(lane.index) + 'px'
            }"
          ></div>

          <!-- 🛡️ BARRES DE TÂCHES SÉCURISÉES -->
          <div
            v-for="task in visibleTasks"
            :key="task.id"
            class="gantt-bar"
            :style="{
              top: topPx(task) + 'px',
              left: leftPercentVisible(task) + '%',
              width: widthPercentVisible(task) + '%',
              backgroundColor: task.color || '#4caf50'
            }"
            @click="onTaskClick(task as any)"
          >
            <span class="gantt-label">{{ task.name }}</span>
          </div>
        </div>
      </div>

      <!-- 🛡️ POP-UP D'ÉDITION SÉCURISÉE -->
      <div
        v-if="isPopupOpen && selectedTask"
        class="gantt-task-popup"
        @click.self="isPopupOpen = false"
      >
        <div class="gantt-task-popup-inner">
          <div class="gantt-task-popup-title">
            <input
              v-model="localTask.name"
              class="gantt-task-input"
              type="text"
              placeholder="Nom de la tâche"
              maxlength="100"
            />
          </div>

          <div class="gantt-task-popup-row">
            Début :
            <input
              v-model="localTask.start"
              type="datetime-local"
              class="gantt-task-input"
            />
          </div>

          <div class="gantt-task-popup-row">
            Durée :
            <input
              v-model.number="localTask.duration"
              type="number"
              min="0"
              max="1000"
              step="0.5"
              class="gantt-task-input small"
            />
            h
          </div>

          <div class="gantt-task-popup-row">
            Commentaire :
            <textarea
              v-model="localTask.comment"
              class="gantt-task-textarea"
              rows="2"
              maxlength="500"
            />
          </div>

          <div class="gantt-task-popup-actions">
            <button
              class="gantt-task-popup-close"
              @click="isPopupOpen = false"
            >
              Fermer
            </button>
            <button
              class="gantt-task-popup-save"
              @click="updateRecordInGrist"
            >
              Enregistrer dans Grist
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Sidebar gauche -->
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
/* Layout principal */
.gantt-wrapper {
  display: grid;
  grid-template-columns: 200px 1fr;
  grid-template-rows: auto 1fr;
  height: 100%;
  border: 1px solid #374151;
  background-color: #111827;
  overflow: hidden;
  color: #e5e7eb;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* Zone haut-gauche : version */
.gantt-top-left {
  grid-column: 1;
  grid-row: 1;
  height: 104px;
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
  font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

/* Partie droite */
.gantt-right {
  grid-column: 2;
  grid-row: 1 / span 2;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Sidebar */
.gantt-sidebar {
  grid-column: 1;
  grid-row: 2;
}

/* Header multi-lignes */
.gantt-header {
  position: relative;
  border-bottom: 1px solid #374151;
  background-color: #111827;
  color: #9ca3af;
  font-size: 10px;
  font-weight: 500;
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
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.gantt-header-cell.is-today {
  background: linear-gradient(135deg, #1d4ed8, #1e40af);
  color: #f9fafb;
  font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.2);
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

/* Ligne 3 : Heures (time-of-day) */
.gantt-header-cell-tod {
  /* on garde les blocs colorés mais on masque le texte */
  font-size: 0;
  opacity: 0.9;
  font-weight: 500;
  color: transparent;
  text-shadow: none;
}

.gantt-header-cell-tod:nth-child(3n + 1) {
  background-color: rgba(37, 99, 235, 0.18);
}
.gantt-header-cell-tod:nth-child(3n + 2) {
  background-color: rgba(16, 185, 129, 0.18);
}
.gantt-header-cell-tod:nth-child(3n + 3) {
  background-color: rgba(234, 179, 8, 0.18);
}

/* Corps principal */
.gantt-body {
  position: relative;
  flex: 1;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: #4b5563 transparent;
}

.gantt-body::-webkit-scrollbar {
  width: 8px;
}

.gantt-body::-webkit-scrollbar-track {
  background: transparent;
}

.gantt-body::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 4px;
}

.gantt-body-inner {
  position: relative;
  min-height: 100%;
  padding-bottom: 20px;
}

.gantt-lane-bg {
  position: absolute;
  left: 0;
  right: 0;
  background-color: #020617;
  border-top: 1px solid #111827;
}

.gantt-empty {
  padding: 40px 20px;
  font-size: 13px;
  color: #9ca3af;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
}

/* Barres de tâches SÉCURISÉES */
.gantt-bar {
  position: absolute;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.1);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(10px);
}

.gantt-bar:hover {
  filter: brightness(1.15) drop-shadow(0 4px 12px rgba(0,0,0,0.4));
  transform: translateY(-1px);
}

.gantt-bar:active {
  transform: translateY(0);
}

/* Label dans la barre */
.gantt-label {
  font-size: 11px;
  color: white;
  padding: 0 8px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

/* Pop-up tâche SÉCURISÉE */
.gantt-task-popup {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.8);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.gantt-task-popup-inner {
  min-width: 280px;
  max-width: 380px;
  background: linear-gradient(145deg, #020617, #111827);
  border: 1px solid #374151;
  border-radius: 12px;
  padding: 20px;
  font-size: 12px;
  color: #e5e7eb;
  box-shadow: 
    0 25px 50px -12px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  animation: popupSlideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes popupSlideIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.gantt-task-popup-title {
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 16px;
  color: #f9fafb;
  padding-bottom: 8px;
  border-bottom: 1px solid #374151;
}

.gantt-task-popup-row {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.gantt-task-popup-row label {
  font-weight: 500;
  min-width: 60px;
  color: #9ca3af;
}

/* Inputs sécurisés */
.gantt-task-input,
.gantt-task-textarea {
  flex: 1;
  box-sizing: border-box;
  background: #020617;
  border: 1px solid #4b5563;
  border-radius: 6px;
  color: #e5e7eb;
  font-size: 11px;
  padding: 6px 8px;
  transition: all 0.2s;
  font-family: inherit;
}

.gantt-task-input:focus,
.gantt-task-textarea:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  background: #111827;
}

.gantt-task-input.small {
  width: 80px;
}

.gantt-task-textarea {
  resize: vertical;
  min-height: 40px;
  font-family: inherit;
}

.gantt-task-popup-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #374151;
}

.gantt-task-popup-close,
.gantt-task-popup-save {
  padding: 6px 16px;
  font-size: 11px;
  border-radius: 6px;
  border: 1px solid #4b5563;
  background: #111827;
  color: #e5e7eb;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  font-family: inherit;
}

.gantt-task-popup-close:hover {
  background: #1f2937;
  border-color: #6b7280;
}

.gantt-task-popup-save {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  border-color: #2563eb;
  color: white;
}

.gantt-task-popup-save:hover {
  background: linear-gradient(135deg, #1d4ed8, #1e40af);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
}

/* Responsive */
@media (max-width: 768px) {
  .gantt-wrapper {
    grid-template-columns: 150px 1fr;
  }
  
  .gantt-header-cell {
    font-size: 9px;
  }
  
  .gantt-label {
    font-size: 10px;
    padding: 0 6px;
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .gantt-header-cell {
    border-left-color: #6b7280;
  }
  
  .gantt-bar {
    border-width: 2px;
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
