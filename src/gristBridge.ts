// src/gristBridge.ts

// Représentation d'une tâche après mapping Grist -> widget
export type Task = {
  id: number;
  name: string;               // texte final affiché dans la barre
  start: string | null;       // Date ISO ou null
  duration: number | null;    // Durée en heures (nombre)
  groupBy: string | null;
  groupBy2: string | null;
  color: string | null;
  isLocked: boolean | null;
  isGlobal: boolean | null;
  comment: string | null;
  content?: string;           // texte brut construit à partir de "Contenu"
};

declare const grist: any;

// Configuration des mappings de colonnes (panneau de droite dans Grist)
export const columnsConfig = [
  { name: 'startDate',  title: 'Date de début',    type: 'Date,DateTime', optional: false },
  { name: 'duration',   title: 'Durée',            type: 'Numeric,Int',   optional: false },
  { name: 'groupBy',    title: 'Grouper par',      type: 'Any',           optional: false },

  { name: 'groupBy2',   title: 'Puis grouper par', type: 'Any',           optional: true },
  { name: 'color',      title: 'Couleur',          type: 'Text,Choice',   optional: true },
  { name: 'isLocked',   title: 'Est verrouillé',   type: 'Bool',          optional: true },
  { name: 'isGlobal',   title: 'Est global',       type: 'Bool',          optional: true },
  { name: 'comment',    title: 'Commentaire',      type: 'Text',          optional: true },

  { name: 'contentCols',  title: 'Contenu',              allowMultiple: true, optional: true },
  { name: 'editableCols', title: 'Colonnes éditables',   allowMultiple: true, optional: true },
  { name: 'totalCols',    title: 'Colonnes de totaux',   allowMultiple: true, optional: true },
];

// Options du widget (panneau de droite)
export type WidgetOptions = {
  dayStartHour?: number;  // heure de début de journée (0-23)
  logoUrl?: string;       // URL du logo
};

// Initialisation de l’API Grist et mapping des enregistrements
export function initGrist(
  onTasksChange: (tasks: Task[]) => void,
  onOptionsChange?: (options: WidgetOptions) => void,
) {
  grist.ready({
    requiredAccess: 'full',
    columns: columnsConfig,
  });

  // Options du widget
  grist.onOptions((options: any) => {
    const safe: WidgetOptions = {};
    if (options && typeof options.dayStartHour === 'number') {
      safe.dayStartHour = options.dayStartHour;
    }
    if (options && typeof options.logoUrl === 'string') {
      safe.logoUrl = options.logoUrl;
    }
    onOptionsChange && onOptionsChange(safe);
  });

  // Données
  grist.onRecords((records: any[], mappings: any) => {
    const mappedRecords = grist.mapColumnNames(records, {
      columns: columnsConfig,
      mappings,
    });

    if (!mappedRecords) {
      onTasksChange([]);
      return;
    }

    const tasks: Task[] = mappedRecords.map((r: any) => {
      // r.contentCols contient déjà les valeurs des colonnes choisies dans "Contenu"
      const parts: string[] = Array.isArray(r.contentCols)
        ? r.contentCols
            .filter((v: any) => v !== null && v !== undefined && v !== '')
            .map(String)
        : [];

      const content = parts.join(' - ');  // séparateur "-"

      const fallbackName = r.Titre ?? r.Name ?? '';

      return {
        id: r.id,
        name: content || fallbackName || 'Tâche',
        start: r.startDate ?? null,
        duration: r.duration != null ? Number(r.duration) : null, // EN HEURES
        groupBy: r.groupBy ?? null,
        groupBy2: r.groupBy2 ?? null,
        color: r.color ?? null,
        isLocked: r.isLocked ?? null,
        isGlobal: r.isGlobal ?? null,
        comment: r.comment ?? null,
        content,
      };
    });

    onTasksChange(tasks);
  });
}
