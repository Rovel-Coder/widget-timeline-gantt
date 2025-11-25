// src/composables/useGanttPopup.ts
import { ref } from 'vue';
import type { Ref } from 'vue';
import type { ParsedTask } from './useGanttTasks';

// le type Popup utilise ParsedTask + infos de lane
export type TaskWithLaneForPopup = ParsedTask & {
  laneIndex: number;
  subRowIndex: number;
};

export function useGanttPopup() {
  const isPopupOpen = ref(false);
  const selectedTask: Ref<TaskWithLaneForPopup | null> = ref(null);

  function onTaskClick(task: TaskWithLaneForPopup) {
    selectedTask.value = task;
    isPopupOpen.value = true;
  }

  function closePopup() {
    isPopupOpen.value = false;
  }

  return {
    isPopupOpen,
    selectedTask,
    onTaskClick,
    closePopup,
  };
}
