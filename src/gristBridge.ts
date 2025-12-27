// src/gristBridge.ts

// 🛡️ FONCTION SANITIZATION GLOBALE (CRITIQUE pour Grist data)
const sanitize = (value: any): string => {
  if (typeof value !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    '',
  );
};

// Représentation d'une tâche APRÈS SANITIZATION (sécurisée)
export type Task = {
  id: number;
  name: string;                  // ✅ TEXTE SÉCURISÉ affiché dans la barre
  start: string | Date | null;   // ✅ Date ISO ou Date native ou null
  duration: number | null;       // Durée en heures (nombre VALIDÉ)
  groupBy: string | null;        // ✅ SÉCURISÉ
  groupBy2: string | null;       // ✅ SÉCURISÉ
  color: string | null;          // ✅ VALIDÉ regex
  isLocked: boolean | null;
  isGlobal: boolean | null;
  comment: string | null;        // ✅ SÉCURISÉ
  content?: string;              // ✅ SÉCURISÉ - texte brut construit
};

// Infos supplémentaires pour édition (sécurisées)
export type EditableContext = {
  tableId: string | null;
  editableCols: string[];        // ✅ Noms colonnes VALIDÉS
};

declare const grist: any;

// Configuration des mappings (panneau Grist)
export const columnsConfig = [
  { name: 'startDate',  title: 'Date de début',    type: 'Date,DateTime', optional: false },
  { name: 'duration',   title: 'Durée',            type: 'Numeric,Int',   optional: false },
  { name: 'groupBy',    title: 'Grouper par',      type: 'Any',           optional: false },

  { name: 'groupBy2',   title: 'Puis grouper par', type: 'Any',           optional: true },
  { name: 'color',      title: 'Couleur',          type: 'Text,Choice',   optional: true },
  { name: 'isLocked',   title: 'Est verrouillé',   type: 'Bool',          optional: true },
  { name: 'isGlobal',   title: 'Est global',       type: 'Bool',          optional: true },
  { name: 'comment',    title: 'Commentaire',      type: 'Text',          optional: true },

  { name: 'contentCols', title: 'Contenu',             allowMultiple: true, optional: true },
  { name: 'editableCols',title: 'Colonnes éditables',  allowMultiple: true, optional: true },
  { name: 'totalCols',   title: 'Colonnes de totaux',  allowMultiple: true, optional: true },
];

// Options widget (sécurisées)
export type WidgetOptions = {
  dayStartHour?: number;  // 0-23 VALIDÉ
  logoUrl?: string;       // ✅ URL sanitizée
};

// 🛡️ INIT GRIST SÉCURISÉ (POINT D'ENTRÉE CRITIQUE)
export function initGrist(
  onTasksChange: (tasks: Task[]) => void,
  onOptionsChange?: (options: WidgetOptions) => void,
  onEditableContextChange?: (ctx: EditableContext) => void,
) {
  grist.ready({
    requiredAccess: 'full',    // ✅ Édition autorisée
    columns: columnsConfig,
  });

  // 🛡️ OPTIONS WIDGET SÉCURISÉES
  grist.onOptions((options: any) => {
    const safe: WidgetOptions = {};

    // ✅ VALIDATION dayStartHour
    if (options && typeof options.dayStartHour === 'number') {
      safe.dayStartHour = Math.max(0, Math.min(23, options.dayStartHour));
    }

    // ✅ VALIDATION logoUrl (no XSS via src)
    if (options && typeof options.logoUrl === 'string') {
      const url = options.logoUrl.trim();
      if (url && !url.startsWith('data:') && !url.startsWith('javascript:')) {
        safe.logoUrl = url;
      }
    }

    onOptionsChange?.(safe);
  });

  // 🛡️ DONNÉES GRIST SÉCURISÉES (CRITIQUE XSS)
  grist.onRecords((records: any[], mappings: any) => {
    const mappedRecords = grist.mapColumnNames(records, {
      columns: columnsConfig,
      mappings,
    });

    if (!mappedRecords) {
      onTasksChange([]);
      onEditableContextChange?.({
        tableId: null,
        editableCols: [],
      });
      return;
    }

    // 🛡️ MAPPING SÉCURISÉ TÂCHES
    const tasks: Task[] = mappedRecords
      .map((r: any, index: number): Task | null => {
        // 1. ✅ ID VALIDÉ number
        const id = Number(r.id);
        if (isNaN(id)) {
          console.warn(`[Grist] ID invalide ligne ${index + 1}`);
          return null;
        }

        // 2. ✅ CONTENT SÉCURISÉ (plusieurs colonnes)
        const parts: string[] = Array.isArray(r.contentCols)
          ? r.contentCols
              .filter((v: any) => v !== null && v !== undefined && v !== '')
              .slice(0, 10)
              .map((v: any) => sanitize(String(v)))
          : [];

        const content = parts.join(' - ');

        // 3. ✅ NAME SÉCURISÉ (fallback sécurisé)
        const rawName = r.Titre ?? r.Name ?? r.contentCols?.[0] ?? '';
        const safeName = sanitize(String(rawName)).slice(0, 100);

        // 4. ✅ GROUPBY SÉCURISÉS
        const safeGroupBy =
          r.groupBy != null ? sanitize(String(r.groupBy)).slice(0, 50) : null;
        const safeGroupBy2 =
          r.groupBy2 != null ? sanitize(String(r.groupBy2)).slice(0, 50) : null;

        // 5. ✅ COULEUR VALIDÉE regex
        const rawColor = r.color ? String(r.color).trim() : null;
        const safeColor =
          rawColor && /^#?[0-9A-Fa-f]{3,8}$/i.test(rawColor) ? rawColor : null;

        // 6. ✅ DURÉE VALIDÉE
        const safeDuration =
          r.duration != null
            ? Math.max(0.1, Math.min(1000, Number(r.duration)))
            : null;

        // 7. ✅ COMMENT SÉCURISÉ
        const safeComment =
          r.comment != null ? sanitize(String(r.comment)).slice(0, 500) : null;

        const task: Task = {
          id,
          name: safeName || content || 'Tâche',
          start: r.startDate ?? null,     // ⬅️ peut être Date ou string
          duration: safeDuration,
          groupBy: safeGroupBy,
          groupBy2: safeGroupBy2,
          color: safeColor,
          isLocked: r.isLocked ?? null,
          isGlobal: r.isGlobal ?? null,
          comment: safeComment,
          content,
        };

        // 🔍 DEBUG (tu peux le supprimer une fois que tout est ok)
        console.log('[Grist->Task]', {
          id: task.id,
          startRaw: r.startDate,
          typeofStartRaw: typeof r.startDate,
          startInTask: task.start,
          typeofStartInTask: typeof task.start,
          durationRaw: r.duration,
        });

        return task;
      })
      // ✅ filter typé pour éviter TS7006 et obtenir Task[]
      .filter((t: Task | null): t is Task => t !== null);

    // ✅ ENVOI TÂCHES SÉCURISÉES
    onTasksChange(tasks);

    // 🛡️ CONTEXTE ÉDITION SÉCURISÉ
    const table = grist.getTable();
    const tableId = table ? table.tableId : null;

    let editableCols: string[] = [];
    if (mappings?.columns?.editableCols) {
      const rawEditable = mappings.columns.editableCols;
      editableCols = Array.isArray(rawEditable)
        ? rawEditable
            .filter(
              (col: any) =>
                typeof col === 'string' &&
                col.length > 0 &&
                col.length < 100,
            )
            .map((col: string) => col.trim())
        : [];
    }

    onEditableContextChange?.({
      tableId,
      editableCols,
    });
  });
}
