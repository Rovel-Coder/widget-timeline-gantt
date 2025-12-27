import { ref, watch } from 'vue';  // ✅ FIX: watch importé

// 🛡️ FONCTION SANITIZATION GLOBALE
const sanitize = (value: any): string => {
  if (typeof value !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
};

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

  // 🛡️ COPIE LOCALE SÉCURISÉE + VALIDATION
  const localTask = ref<PopupTask>({
    id: 0,
    name: '',
    start: '',
    duration: 0,
    comment: '',
  });

  function onTaskClick(task: PopupTask) {
    selectedTask.value = task;
    
    // 🛡️ SANITIZATION + VALIDATION des données d'entrée
    const safeName = sanitize(task.name ?? '');
    const safeComment = sanitize(task.comment ?? '');
    
    localTask.value = {
      ...task,
      name: safeName,
      comment: safeComment,
      duration: Math.max(0.1, Math.min(1000, Number(task.duration) || 1)),
      start: task.start
        ? (() => {
            const date = new Date(task.start);
            return isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 16);
          })()
        : '',
    };
    
    isPopupOpen.value = true;
  }

  // 🛡️ WATCH pour resynchroniser (✅ FIX TS2304 + TS7006)
  watch(selectedTask, (newTask: PopupTask | null) => {  // ✅ Type explicite
    if (newTask && isPopupOpen.value) {
      localTask.value.name = sanitize(newTask.name ?? '');
      localTask.value.comment = sanitize(newTask.comment ?? '');
    }
  });

  async function updateRecordInGrist() {
    if (!selectedTask.value || !opts.tableRef?.value) return;
    
    const rowId = selectedTask.value.id;
    const cols = opts.editableCols.value;

    if (!rowId || !cols.length) {
      console.warn('Update Grist: ID ou colonnes manquants');
      return;
    }

    const safeData = {
      name: sanitize(localTask.value.name ?? ''),
      comment: sanitize(localTask.value.comment ?? ''),
      duration: Math.max(0.1, Math.min(1000, Number(localTask.value.duration) || 1)),
      start: localTask.value.start ? new Date(localTask.value.start) : null,
    };

    const fields: Record<string, any> = {};
    for (const col of cols) {
      switch (col) {
        case 'Name':
          fields[col] = safeData.name || null;
          break;
        case 'Start':
          fields[col] = safeData.start;
          break;
        case 'Duration':
          fields[col] = safeData.duration;
          break;
        case 'Comment':
          fields[col] = safeData.comment || null;
          break;
        default:
          if (localTask.value[col] !== undefined) {
            fields[col] = sanitize(localTask.value[col]);
          }
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
      console.error('Erreur update Grist:', e);
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
