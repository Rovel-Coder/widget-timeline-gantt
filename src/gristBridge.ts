// src/gristBridge.ts
export type Task = {
  id: number;
  name: string;
  start: string | null;
  duration: number | null;
  groupBy: string | null;
  groupBy2: string | null;
  color: string | null;
  isLocked: boolean | null;
  isGlobal: boolean | null;
  comment: string | null;
};

declare const grist: any;

// Configuration des mappings de colonnes
export const columnsConfig = [
  { name: 'startDate',  title: 'Date de début', type: 'Date,DateTime', optional: false },
  { name: 'duration',   title: 'Durée',        type: 'Numeric,Int',   optional: false },
  { name: 'groupBy',    title: 'Grouper par',  type: 'Any',           optional: false },

  { name: 'groupBy2',   title: 'Puis grouper par', type: 'Any',       optional: true },
  { name: 'color',      title: 'Couleur',          type: 'Text,Choice', optional: true },
  { name: 'isLocked',   title: 'Est verrouillé',   type: 'Bool',      optional: true },
  { name: 'isGlobal',   title: 'Est global',       type: 'Bool',      optional: true },
  { name: 'comment',    title: 'Commentaire',      type: 'Text',      optional: true },

  { name: 'contentCols',   title: 'Contenu',             allowMultiple: true, optional: true },
  { name: 'editableCols',  title: 'Colonnes éditables',  allowMultiple: true, optional: true },
  { name: 'totalCols',     title: 'Colonnes de totaux',  allowMultiple: true, optional: true },
];

export function initGrist(onTasksChange: (tasks: Task[]) => void) {
  grist.ready({
    requiredAccess: 'full',
    columns: columnsConfig,
  });

  grist.onRecords((records: any[], mappings: any) => {
    const mappedRecords = grist.mapColumnNames(records, {
      columns: columnsConfig,
      mappings,
    }); // helper documenté dans la doc widget personnalisé. [web:210][web:280]

    if (!mappedRecords) {
      onTasksChange([]);
      return;
    }

    const tasks: Task[] = mappedRecords.map((r: any) => ({
      id: r.id,
      name: r.Name ?? '',
      start: r.startDate ?? null,
      duration: r.duration ?? null,
      groupBy: r.groupBy ?? null,
      groupBy2: r.groupBy2 ?? null,
      color: r.color ?? null,
      isLocked: r.isLocked ?? null,
      isGlobal: r.isGlobal ?? null,
      comment: r.comment ?? null,
    }));

    onTasksChange(tasks);
  });
}
