
// src/components/GanttHeader.vue
<script setup lang="ts">
type Bucket = { left: number; width: number; label: string; date?: Date };

const props = defineProps<{
  timeScale: 'week' | 'month' | 'quarter';
  weekWeekBuckets: Bucket[];
  weekDayBuckets: Bucket[];
  monthMonthBuckets: Bucket[];
  monthWeekBuckets: Bucket[];
  quarterMonthBuckets: Bucket[];
}>();
</script>

<template>
  <div class="gantt-header">
    <!-- Ligne 1 -->
    <div class="gantt-header-row">
      <template v-if="props.timeScale === 'week'">
        <div
          v-for="b in props.weekWeekBuckets"
          :key="'ww-' + b.left"
          class="gantt-header-cell"
          :style="{ left: b.left + '%', width: b.width + '%' }"
        >
          {{ b.label }}
        </div>
      </template>

      <template v-else-if="props.timeScale === 'month'">
        <div
          v-for="b in props.monthMonthBuckets"
          :key="'mm-' + b.left"
          class="gantt-header-cell"
          :style="{ left: b.left + '%', width: b.width + '%' }"
        >
          {{ b.label }}
        </div>
      </template>

      <template v-else>
        <div
          v-for="b in props.quarterMonthBuckets"
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
      <template v-if="props.timeScale === 'week'">
        <div
          v-for="b in props.weekDayBuckets"
          :key="'wd-' + b.left"
          class="gantt-header-cell"
          :class="{
            'is-today':
              b.date && b.date.toDateString() === new Date().toDateString(),
          }"
          :style="{ left: b.left + '%', width: b.width + '%' }"
        >
          {{ b.label }}
        </div>
      </template>

      <template v-else-if="props.timeScale === 'month'">
        <div
          v-for="b in props.monthWeekBuckets"
          :key="'mw-' + b.left"
          class="gantt-header-cell"
          :style="{ left: b.left + '%', width: b.width + '%' }"
        >
          {{ b.label }}
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
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
</style>
