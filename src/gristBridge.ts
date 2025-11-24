// src/gristBridge.ts

// Représentation d'une tâche après mapping Grist -> widget
export type Task = {
  id: number;
  name: string;
  start: string | null;      // Date ISO ou null
  duration: number | null;   // Durée en jours (nombre)
  groupBy: string | null;
  groupBy2: string | null;
  color: string | null;
  isLocked: boolean | null;
  isGlobal: boolean | null;
  comment: string | null;
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

  { name: 'contentCols',  title: 'Contenu',             allowMultiple: true, optional: true },
  { name: 'editableCols', title: 'Colonnes éditables',  allowMultiple: true, optional: true },
  { name: 'totalCols',    title: 'Colonnes de totaux',  allowMultiple: true, optional: true },
];

// Initialisation de l’API Grist et mapping des enregistrements
export function initGrist(onTasksChange: (tasks: Task[]) => void) {
  // Demande d’accès + déclaration des colonnes configurables
  grist.ready({
    requiredAccess: 'full',
    columns: columnsConfig,
  }); // Grist recommande ce schéma pour les widgets personnalisés. [web:210][web:280]

  grist.onRecords((records: any[], mappings: any) => {
    const mappedRecords = grist.mapColumnNames(records, {
      columns: columnsConfig,
      mappings,
    }); // Permet d’accéder aux colonnes par les noms de columnsConfig. [web:210][web:280]

    console.log('RAW records', records);
    console.log('MAPPED records', mappedRecords);

    // Tant que les champs obligatoires ne sont pas mappés, mappedRecords === null
    if (!mappedRecords) {
      onTasksChange([]);
      return;
    }

    const tasks: Task[] = mappedRecords.map((r: any) => ({
      id: r.id,
      // ta table a une colonne "Titre" -> on la prend par défaut comme nom
      name: r.Titre ?? r.Name ?? '',
      start: r.startDate ?? null,
      // Grist stocke les durées comme nombres (jours) même si l’affichage montre "1 day, 0:00:00"
      duration: r.duration != null ? Number(r.duration) : null,
      groupBy: r.groupBy ?? null,
      groupBy2: r.groupBy2 ?? null,
      color: r.color ?? null,
      isLocked: r.isLocked ?? null,
      isGlobal: r.isGlobal ?? null,
      comment: r.comment ?? null,
    }));

    console.log('TASKS sent to Vue', tasks);

    onTasksChange(tasks);
  }); // Utilisation typique de grist.onRecords dans les widgets. [web:280][web:518]
}
