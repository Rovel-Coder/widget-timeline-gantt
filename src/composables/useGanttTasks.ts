// src/composables/useGanttTasks.ts
import { computed } from 'vue';
import type { Ref } from 'vue';
import type { Task } from '../gristBridge';

// 🛡️ FONCTION SANITIZATION pour labels (groupes)
const sanitizeLabel = (value: any): string => {
  if (typeof value !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    '',
  );
};

export type ParsedTask = Task & {
  startDate: Date;
  endDate: Date;
};

export type Lane = {
  index: number;
  groupBy: string;
  groupBy2: string;
  label: string;
  isGroupHeader: boolean;
};

export type TaskWithLane = ParsedTask & {
  laneIndex: number;
  subRowIndex: number;
};

export type VisibleTask = TaskWithLane & {
  visibleStart: Date;
  visibleEnd: Date;
};

export function useGanttTasks(
  tasksProp: Ref<Task[]>,
  laneLabelHeights: Ref<Record<number, number>>,
  baseLaneHeight: number,
  laneOuterGap: number,
  subRowGap: number,
  minDate: Ref<Date>,
  maxDate: Ref<Date>,
) {
  // 1) Tâches parsées sécurisées (gestion Date | string | null)
  const parsedTasks = computed<ParsedTask[]>(() =>
    tasksProp.value
      .filter(
        (t) =>
          t.start != null &&
          t.duration != null &&
          !isNaN(Number(t.duration)),
      )
      .map((t) => {
        let startDate: Date | null = null;

        if (t.start instanceof Date) {
          // Grist renvoie un Date natif
          startDate = t.start;
        } else if (typeof t.start === 'string') {
          // Grist renvoie une string (DateTime ou ISO)
          startDate = new Date(t.start);
        }

        if (!startDate || isNaN(startDate.getTime())) return null;

        const hours = Math.max(0.1, Math.min(1000, Number(t.duration)));
        const endDate = new Date(startDate.getTime() + hours * 60 * 60 * 1000);

        // DEBUG (tu peux commenter une fois que tout est OK)
        console.log('[Gantt parsed]', {
          id: t.id,
          start: t.start,
          startDate,
          endDate,
        });

        return {
          ...t,
          startDate,
          endDate,
          name: sanitizeLabel(t.name),
        };
      })
      .filter(Boolean) as ParsedTask[],
  );

  // 2) Lanes hiérarchiques sécurisées
  const lanes = computed<Lane[]>(() => {
    const result: Lane[] = [];
    let nextIndex = 0;

    const byGroup = new Map<string, ParsedTask[]>();
    for (const t of parsedTasks.value) {
      const g1 = sanitizeLabel(t.groupBy ?? 'Sans groupe');
      if (!byGroup.has(g1)) byGroup.set(g1, []);
      byGroup.get(g1)!.push(t);
    }

    for (const [g1, tasks] of byGroup.entries()) {
      // Ligne de groupe principale
      result.push({
        index: nextIndex++,
        groupBy: g1,
        groupBy2: '',
        label: g1 || '—',
        isGroupHeader: true,
      });

      // Sous-groupes
      const seenSub = new Set<string>();
      for (const t of tasks) {
        const g2 = sanitizeLabel(t.groupBy2 ?? '');
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
  const tasksWithLane = computed<TaskWithLane[]>(() => {
    const byKey = new Map<string, number>();
    for (const lane of lanes.value) {
      const key = `${lane.groupBy}||${lane.groupBy2}`;
      byKey.set(key, lane.index);
    }

    const base: TaskWithLane[] = parsedTasks.value.map((t) => {
      const g1 = sanitizeLabel(t.groupBy ?? '');
      const g2 = sanitizeLabel(t.groupBy2 ?? '');
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
          if (!row || !row.tasks?.length) continue;
          const last = row.tasks[row.tasks.length - 1];
          if (last && start >= last.end) {
            row.tasks.push({ start, end });
            result.push({ ...t, subRowIndex: i });
            placed = true;
            break;
          }
        }

        if (!placed) {
          const newRow = { tasks: [{ start, end }] };
          rows.push(newRow);
          result.push({ ...t, subRowIndex: rows.length - 1 });
        }
      }
    }

    return result;
  });

  // 4) Calcul hauteur / top des lanes
  const laneRowCount = computed<Record<number, number>>(() => {
    const map: Record<number, number> = {};
    for (const t of tasksWithLane.value) {
      const current = map[t.laneIndex] ?? 0;
      const needed = t.subRowIndex + 1;
      if (needed > current) map[t.laneIndex] = needed;
    }
    return map;
  });

  function laneHeightFor(laneIndex: number): number {
    const rows = laneRowCount.value[laneIndex] ?? 1;
    const barsHeight =
      rows <= 1
        ? baseLaneHeight
        : rows * baseLaneHeight + (rows - 1) * subRowGap;

    const labelHeight = laneLabelHeights.value[laneIndex] ?? baseLaneHeight;
    return Math.max(barsHeight, labelHeight);
  }

  function laneTopPx(laneIndex: number) {
    let top = 10;
    for (let i = 0; i < laneIndex; i++) {
      top += laneHeightFor(i) + laneOuterGap;
    }
    return top;
  }

  // 5) Projection dans la fenêtre temporelle
  const totalMs = computed(() => {
    const diff = maxDate.value.getTime() - minDate.value.getTime();
    return diff || 1;
  });

  const visibleTasks = computed<VisibleTask[]>(() => {
    const startView = minDate.value.getTime();
    const endView = maxDate.value.getTime();

    return tasksWithLane.value
      .map((t) => {
        const taskStart = t.startDate.getTime();
        const taskEnd = t.endDate.getTime();

        if (taskEnd <= startView || taskStart >= endView) return null;

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

  function topPx(task: TaskWithLane) {
    const laneTop = laneTopPx(task.laneIndex);
    const laneH = laneHeightFor(task.laneIndex);
    const rows = laneRowCount.value[task.laneIndex] ?? 1;

    const rowHeight = 24;
    const rowIndex = task.subRowIndex ?? 0;

    const rowsBlockHeight =
      rows * rowHeight + (rows - 1) * subRowGap;
    const topMargin = (laneH - rowsBlockHeight) / 2;

    return laneTop + topMargin + rowIndex * (rowHeight + subRowGap);
  }

  return {
    lanes,
    tasksWithLane,
    laneHeightFor,
    laneTopPx,
    visibleTasks,
    leftPercentVisible,
    widthPercentVisible,
    topPx,
  };
}
