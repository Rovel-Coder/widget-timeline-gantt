// src/components/GanttSidebar.vue

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

const labelRefs = ref<HTMLElement[]>([]);

function setLabelRef(el: HTMLElement | null, idx: number) {
  if (el) {
    labelRefs.value[idx] = el;
  }
}

const getLaneLabelHeights = () => {
  return labelRefs.value.map((el) => el?.offsetHeight ?? props.laneHeight);
};

defineExpose({ getLaneLabelHeights });
</script>

<template>
  <div class="gantt-sidebar">
    <div v-if="!props.lanes.length" class="gantt-empty">
      Aucune tâche
    </div>
    <div v-else class="gantt-sidebar-inner">
      <div
        v-for="lane in props.lanes"
        :key="'sbg-' + lane.index"
        class="gantt-lane-bg-sidebar"
        :style="{
          top: props.laneTopFn(lane.index) + 'px',
          height: props.laneHeightFn(lane.index) + 'px'
        }"
      ></div>
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
          minHeight: props.laneHeightFn(lane.index) + 'px'
        }"
        :ref="(el) => setLabelRef(el as HTMLElement | null, i)"
      >
        <span class="gantt-lane-label-content">
          {{ lane.label || '—' }}
        </span>
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

.gantt-sidebar::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.gantt-sidebar {
  scrollbar-width: none;
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
  width: 100%;
  display: flex;
  align-items: center;
  font-size: 12px;
  padding-left: 8px;
  z-index: 1;
  white-space: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 4px;
}

.gantt-lane-label-content {
  width: 100%;
  line-height: 16px;
  display: block;
  word-break: break-word;
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
