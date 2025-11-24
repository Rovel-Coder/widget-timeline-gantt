<script setup lang="ts">
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
}>();

function laneTopPx(laneIndex: number) {
  return (
    props.lanesTopOffset +
    props.laneGap +
    laneIndex * (props.laneHeight + props.laneGap)
  );
}
</script>

<template>
  <div class="gantt-sidebar">
    <!-- zone alignée avec la toolbar de droite -->
    <div class="gantt-sidebar-toolbar">
      <span class="gantt-version">{{ props.version }}</span>
    </div>

    <!-- rectangle invisible pour compenser la zone dates/mois (36px) -->
    <div class="gantt-sidebar-placeholder"></div>

    <div v-if="!props.lanes.length" class="gantt-empty">
      Aucune tâche
    </div>
    <div v-else class="gantt-sidebar-inner">
      <div
        v-for="lane in props.lanes"
        :key="'sbg-' + lane.index"
        class="gantt-lane-bg-sidebar"
        :style="{
          top: laneTopPx(lane.index) + 'px',
          height: props.laneHeight + 'px'
        }"
      ></div>

      <div
        v-for="lane in props.lanes"
        :key="lane.index"
        class="gantt-lane-label"
        :class="{
          'gantt-lane-group': lane.isGroupHeader,
          'gantt-lane-sub': !lane.isGroupHeader,
        }"
        :style="{
          top: laneTopPx(lane.index) + 'px',
          height: props.laneHeight + 'px'
        }"
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

.gantt-sidebar-toolbar {
  height: 24px;
  border-bottom: 1px solid #374151;
  background-color: #020617;
  display: flex;
  align-items: center;
  padding: 0 8px;
}

.gantt-version {
  font-size: 10px;
  color: #9ca3af;
}

.gantt-sidebar-placeholder {
  height: 36px;
  background-color: #111827;
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

.gantt-empty {
  padding: 8px;
  font-size: 13px;
  color: #9ca3af;
}
</style>
