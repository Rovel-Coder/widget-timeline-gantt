import { ref } from 'vue';

interface PopupTask {
  id: number;
  name?: string | null;
  start?: string | null;
  duration?: number | null;
  comment?: string | null;
  [key: string]: any;
}


export function useGanttPopup(opts: {
  tableRef: any;
  editableCols: { value: string[] };
}) {
  const isPopupOpen = ref(false);
  const selectedTask = ref<PopupTask | null>(null);

  // copie locale éditable
  const localTask = ref<PopupTask>({
    id: 0,
    name: '',
    start: '',
    duration: 0,
    comment: '',
  });

  function onTaskClick(task: PopupTask) {
    selectedTask.value = task;
    localTask.value = {
      ...task,
      // s’assurer que start est une string compatible datetime-local
      start: task.start
        ? new Date(task.start).toISOString().slice(0, 16)
        : '',
    };
    isPopupOpen.value = true;
  }

  async function updateRecordInGrist() {
    if (!selectedTask.value || !opts.tableRef.value) return;
    const rowId = selectedTask.value.id;
    const cols = opts.editableCols.value;

    if (!rowId || !cols.length) {
      return;
    }

    // map localTask -> colonnes Grist
    const fields: Record<string, any> = {};

    for (const col of cols) {
      switch (col) {
        case 'Name':
          fields[col] = localTask.value.name ?? null;
          break;
        case 'Start':
          fields[col] = localTask.value.start
            ? new Date(localTask.value.start)
            : null;
          break;
        case 'Duration':
          fields[col] = localTask.value.duration ?? null;
          break;
        case 'Comment':
          fields[col] = localTask.value.comment ?? null;
          break;
        default:
          // si tu ajoutes d’autres colonnes éditables, gère-les ici
          break;
      }
    }

    try {
      await opts.tableRef.value.update({
        id: rowId,
        fields,
      });
      isPopupOpen.value = false;
    } catch (e) {
      // tu peux ajouter une gestion d’erreur plus avancée
      console.error('Erreur update Grist', e);
    }
  }

  return {
    isPopupOpen,
    selectedTask,
    onTaskClick,
    updateRecordInGrist,
    localTask,
  };
}
