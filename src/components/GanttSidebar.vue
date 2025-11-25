<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  version: string;
  lanes: {
    index: number;
    label: string;
    isGroupHeader: boolean;
  }[];
  laneHeight: number;
  laneGap: number;
  lanesTopOffset: number;
  laneTopFn: (laneIndex: number) => number;
  laneHeightFn: (laneIndex: number) => number;
}>();

// refs sur les labels pour mesurer leur hauteur
const labelRefs = ref<HTMLElement[]>([]);

function setLabelRef(el: HTMLElement | null, idx: number) {
  if (el) {
    labelRefs.value[idx] = el;
  }
}

// exposé au parent (GanttChart) pour récupérer les hauteurs
const getLaneLabelHeights = () => {
  return labelRefs.value.map((el) => el?.offsetHeight ?? props.laneHeight);
};

defineExpose({ getLaneLabelHeights });
</script>

<template>
  <div class="gantt-sidebar">
    <!-- barre alignée avec la toolbar de droite -->
    <div class="gantt-sidebar-toolbar">
      <span class="gantt-version">{{ props.version }}</span>
    </div>

    <!-- placeholder (3 lignes de header à 25px) -->
    <div class="gantt-sidebar-placeholder"></div>

    <div v-if="!props.lanes.length" class="gantt-empty">
      Aucune tâche
    </div>
    <div v-else class="gantt-sidebar-inner">
      <!-- fond des lanes, hauteur dynamique -->
      <div
        v-for="lane in props.lanes"
        :key="'sbg-' + lane.index"
        class="gantt-lane-bg-sidebar"
        :style="{
          top: props.laneTopFn(lane.index) + 'px',
          height: props.laneHeightFn(lane.index) + 'px'
        }"
      ></div>

      <!-- labels -->
      <div
        v-for="(lane, i) in props.lanes"
        :key="lane.index"
        class="gantt-lane-label"
        :class="{
          'gantt-lane-group': lane.isGroupHeader,
          'gantt-lane-sub': !lane.isGroupHeader,
        }"
        :style="{
          top: props.laneTopFn(lane.index) + 'px',
          height: props.laneHeight + 'px'
        }"
        :ref="(el) => setLabelRef(el as HTMLElement | null, i)"
      >
        {{ lane.label || '—' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.gantt-sidebar {
  position: relative;
  border-right: 1px solid #374151;
  overflow: hidden;
}

/* 25px comme la toolbar de droite */
.gantt-sidebar-toolbar {
  height: 25px;
  background-color: #020617;
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

/* 3 lignes de header à 25px => 75px */
.gantt-sidebar-placeholder {
  height: 77.5px;
  background-color: #111827;
}

/* contenu des lanes */
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
  padding-left: 8px;
  z-index: 1;

  /* retour à la ligne + protection débordement */
  white-space: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 4px;
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

.gantt-empty {
  padding: 8px;
  font-size: 13px;
  color: #9ca3af;
}
</style>
