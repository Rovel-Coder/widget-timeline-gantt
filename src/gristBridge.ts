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

// Infos supplémentaires nécessaires pour l’édition
export type EditableContext = {
  tableId: string | null;        // id de la table source
  editableCols: string[];        // noms de colonnes réellement éditables dans la table
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

// callbacks supplémentaires pour édition
export function initGrist(
  onTasksChange: (tasks: Task[]) => void,
  onOptionsChange?: (options: WidgetOptions) => void,
  onEditableContextChange?: (ctx: EditableContext) => void,
) {
  grist.ready({
    requiredAccess: 'full',    // IMPORTANT : permet l'édition
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
      onEditableContextChange && onEditableContextChange({
        tableId: null,
        editableCols: [],
      });
      return;
    }

    // r.contentCols contient déjà les valeurs des colonnes choisies dans "Contenu"
    const tasks: Task[] = mappedRecords.map((r: any) => {
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

    // Récupération du contexte d’édition :
    // - id de la table sélectionnée
    // - noms de colonnes réellement éditables dans cette table
    const table = grist.getTable();              // table associée au widget [web:18]
    const tableId = table ? table.tableId : null;

    // editableCols dans mappedRecords correspond aux valeurs des colonnes choisies
    // La fonction mapColumnNamesBack permet de retrouver les vrais noms de colonnes. [web:18]
    let editableCols: string[] = [];
    if (mappings && mappings.columns && mappings.columns.editableCols) {
      const rawEditable = mappings.columns.editableCols;   // -> noms physiques déjà
      editableCols = Array.isArray(rawEditable) ? rawEditable : [];
    }

    onEditableContextChange && onEditableContextChange({
      tableId,
      editableCols,
    });
  });
}
