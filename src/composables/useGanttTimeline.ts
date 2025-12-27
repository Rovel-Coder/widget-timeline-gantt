import { computed } from 'vue';
import type { Ref } from 'vue';

type TimeScale = 'week' | 'month' | 'quarter' | 'p4s';

export type Bucket = { left: number; width: number; label: string; date?: Date };
export type TimeOfDayBucket = Bucket & { slot: 'morning' | 'afternoon' | 'night' };

type TimelineArgs = {
  timeScale: Ref<TimeScale>;
  offset: Ref<number>;
  referenceDateSource: () => Date;     // fonction qui renvoie la date de référence (calculée à partir des tâches)
  dayStartHour: Ref<number>;
};

export function useGanttTimeline(args: TimelineArgs) {
  const { timeScale, offset, referenceDateSource, dayStartHour } = args;

  // date de référence (min de toutes les dates de début)
  const referenceDate = computed(() => referenceDateSource());

  // bornes "de base" avant décalage offset
  const baseMinDate = computed(() => {
    const d = new Date(referenceDate.value);

    if (timeScale.value === 'week' || timeScale.value === 'p4s') {
      const day = d.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(d);
      monday.setDate(monday.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);

      if (timeScale.value === 'week') {
        // semaine classique : du lundi au dimanche
        return monday;
      }

      // P4S : ancrage logique sur le lundi de la 1ère semaine,
      // mais on élargit l'affichage au samedi précédent
      const visualStart = new Date(monday);
      visualStart.setDate(visualStart.getDate() - 2); // samedi avant ce lundi
      visualStart.setHours(0, 0, 0, 0);
      return visualStart;
    }

    if (timeScale.value === 'month') {
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    const q = Math.floor(d.getMonth() / 3);
    const qStart = new Date(d.getFullYear(), q * 3, 1);
    qStart.setHours(0, 0, 0, 0);
    return qStart;
  });

  const baseMaxDate = computed(() => {
    const d = new Date(referenceDate.value);

    if (timeScale.value === 'week' || timeScale.value === 'p4s') {
      const day = d.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(d);
      monday.setDate(monday.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);

      if (timeScale.value === 'week') {
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return sunday;
      }

      // P4S :
      // - 4 semaines complètes à partir de ce lundi (S1 → S4)
      // - on ajoute le lundi qui suit S4 pour la continuité visuelle
      const visualEnd = new Date(monday);
      visualEnd.setDate(visualEnd.getDate() + 28); // lundi après S4
      visualEnd.setHours(23, 59, 59, 999);
      return visualEnd;
    }

    if (timeScale.value === 'month') {
      const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      lastDayOfMonth.setHours(23, 59, 59, 999);
      return lastDayOfMonth;
    }

    const q = Math.floor(d.getMonth() / 3);
    const qEnd = new Date(d.getFullYear(), q * 3 + 3, 0);
    qEnd.setHours(23, 59, 59, 999);
    return qEnd;
  });

  // bornes effectives selon offset
  const minDate = computed(() => {
    const k = offset.value;

    if (timeScale.value === 'week' || timeScale.value === 'p4s') {
      const d = new Date(baseMinDate.value);
      d.setDate(d.getDate() + k * 7);
      return d;
    }

    if (timeScale.value === 'month') {
      const ref = new Date(referenceDate.value);
      ref.setMonth(ref.getMonth() + k, 1);
      ref.setHours(0, 0, 0, 0);
      return ref;
    }

    const d = new Date(baseMinDate.value);
    d.setMonth(d.getMonth() + k * 3);
    const day = d.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const maxDate = computed(() => {
    const k = offset.value;

    if (timeScale.value === 'week' || timeScale.value === 'p4s') {
      const d = new Date(baseMaxDate.value);
      d.setDate(d.getDate() + k * 7);
      return d;
    }

    if (timeScale.value === 'month') {
      const ref = new Date(referenceDate.value);
      ref.setMonth(ref.getMonth() + k + 1, 0);
      ref.setHours(23, 59, 59, 999);
      return ref;
    }

    const d = new Date(baseMaxDate.value);
    d.setMonth(d.getMonth() + k * 3);
    const day = d.getDay();
    const diffToSunday = 7 - (day === 0 ? 7 : day);
    d.setDate(d.getDate() + diffToSunday);
    d.setHours(23, 59, 59, 999);
    return d;
  });

  const totalMs = computed(() => {
    const diff = maxDate.value.getTime() - minDate.value.getTime();
    return diff || 1;
  });

  // utilitaire ISO semaine
  function getIsoWeekNumber(date: Date): number {
    const tmp = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const day = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      ((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return weekNo;
  }

  // Buckets Matin/AM/Nuit (vue semaine / P4S)
  const timeOfDayBuckets = computed<TimeOfDayBucket[]>(() => {
    const res: TimeOfDayBucket[] = [];
    if (timeScale.value !== 'week' && timeScale.value !== 'p4s') return res;

    const start = new Date(minDate.value);
    const end = new Date(maxDate.value);
    const oneDay = 24 * 60 * 60 * 1000;

    for (let ts = start.getTime(); ts <= end.getTime(); ts += oneDay) {
      const dayStart = new Date(ts);

      const mStart = new Date(dayStart);
      mStart.setHours(8, 0, 0, 0);
      const mEnd = new Date(dayStart);
      mEnd.setHours(14, 0, 0, 0);

      const aStart = new Date(dayStart);
      aStart.setHours(14, 0, 0, 0);
      const aEnd = new Date(dayStart);
      aEnd.setHours(20, 0, 0, 0);

      const nStart = new Date(dayStart);
      nStart.setHours(20, 0, 0, 0);
      const nEnd = new Date(dayStart.getTime() + oneDay);
      nEnd.setHours(8, 0, 0, 0);

      const addBucket = (
        slot: TimeOfDayBucket['slot'],
        bStart: Date,
        bEnd: Date,
        label: string,
      ) => {
        const left =
          ((bStart.getTime() - minDate.value.getTime()) / totalMs.value) * 100;
        const width =
          ((bEnd.getTime() - bStart.getTime()) / totalMs.value) * 100;
        res.push({ left, width, label, slot });
      };

      addBucket('morning', mStart, mEnd, 'Matin');
      addBucket('afternoon', aStart, aEnd, 'Après‑midi');
      addBucket('night', nStart, nEnd, 'Nuit');
    }

    return res;
  });

  // Semaine (ligne 1 - vue semaine / P4S)
  const weekWeekBuckets = computed<Bucket[]>(() => {
    const res: Bucket[] = [];
    if (timeScale.value !== 'week' && timeScale.value !== 'p4s') return res;

    const oneDay = 24 * 60 * 60 * 1000;

    // On aligne les semaines sur le lundi qui couvre minDate,
    // même si minDate est un samedi en P4S.
    const first = new Date(minDate.value);
    const day = first.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const firstMonday = new Date(first);
    firstMonday.setDate(firstMonday.getDate() + diffToMonday);
    firstMonday.setHours(0, 0, 0, 0);

    const end = new Date(maxDate.value);

    let weekStart = firstMonday;
    while (weekStart <= end) {
      const weekEnd = new Date(weekStart.getTime() + 6 * oneDay);
      const weekNumber = getIsoWeekNumber(weekStart);
      const left =
        ((weekStart.getTime() - minDate.value.getTime()) / totalMs.value) * 100;
      const width =
        ((weekEnd.getTime() - weekStart.getTime() + oneDay) / totalMs.value) *
        100;
      res.push({ left, width, label: `S${weekNumber}` });
      weekStart = new Date(weekStart.getTime() + 7 * oneDay);
    }
    return res;
  });

  // Jours (ligne 2 - vue semaine / P4S)
  const weekDayBuckets = computed<Bucket[]>(() => {
    const res: Bucket[] = [];
    if (timeScale.value !== 'week' && timeScale.value !== 'p4s') return res;
    const start = new Date(minDate.value);
    const end = new Date(maxDate.value);
    const oneDay = 24 * 60 * 60 * 1000;

    for (let ts = start.getTime(); ts <= end.getTime(); ts += oneDay) {
      const d = new Date(ts);
      const bucketStart = new Date(d);
      bucketStart.setHours(dayStartHour.value, 0, 0, 0);
      const label = bucketStart.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: '2-digit',
      });
      const left =
        ((bucketStart.getTime() - minDate.value.getTime()) / totalMs.value) *
        100;
      const width = (oneDay / totalMs.value) * 100;
      res.push({ left, width, label, date: bucketStart });
    }
    return res;
  });

  // Mois (ligne 1 - vue mois ou trimestre)
  const monthMonthBuckets = computed<Bucket[]>(() => {
    const res: Bucket[] = [];
    if (timeScale.value !== 'month' && timeScale.value !== 'quarter') return res;
    const start = new Date(minDate.value);
    const end = new Date(maxDate.value);
    const oneDay = 24 * 60 * 60 * 1000;

    const d = new Date(start);
    d.setDate(1);
    while (d <= end) {
      const monthStart = new Date(d);
      const monthEnd = new Date(d);
      monthEnd.setMonth(monthEnd.getMonth() + 1, 0);

      const label = monthStart.toLocaleDateString('fr-FR', {
        month: 'short',
        year: '2-digit',
      });

      const left =
        ((monthStart.getTime() - minDate.value.getTime()) / totalMs.value) *
        100;
      const width =
        ((monthEnd.getTime() - monthStart.getTime() + oneDay) / totalMs.value) *
        100;

      res.push({ left, width, label });
      d.setMonth(d.getMonth() + 1, 1);
    }
    return res;
  });

  // Semaines (ligne 2 - vue mois)
  const monthWeekBuckets = computed<Bucket[]>(() => {
    const res: Bucket[] = [];
    if (timeScale.value !== 'month') return res;
    const start = new Date(minDate.value);
    const end = new Date(maxDate.value);
    const oneDay = 24 * 60 * 60 * 1000;

    let weekStart = new Date(start);
    while (weekStart <= end) {
      const weekEnd = new Date(weekStart.getTime() + 6 * oneDay);
      const weekNumber = getIsoWeekNumber(weekStart);
      const left =
        ((weekStart.getTime() - minDate.value.getTime()) / totalMs.value) *
        100;
      const width =
        ((weekEnd.getTime() - weekStart.getTime() + oneDay) / totalMs.value) *
        100;
      res.push({ left, width, label: `S${weekNumber}` });
      weekStart = new Date(weekStart.getTime() + 7 * oneDay);
    }
    return res;
  });

  // Jours (ligne 3 - vue mois)
  const monthDayBuckets = computed<Bucket[]>(() => {
    const res: Bucket[] = [];
    if (timeScale.value !== 'month') return res;

    const start = new Date(minDate.value);
    const end = new Date(maxDate.value);
    const oneDay = 24 * 60 * 60 * 1000;

    for (let ts = start.getTime(); ts <= end.getTime(); ts += oneDay) {
      const d = new Date(ts);
      const label = d.toLocaleDateString('fr-FR', { day: '2-digit' });
      const left =
        ((d.getTime() - minDate.value.getTime()) / totalMs.value) * 100;
      const width = (oneDay / totalMs.value) * 100;
      res.push({ left, width, label, date: d });
    }
    return res;
  });

  // Trimestre (ligne 1 - vue trimestre) = regroupement de 3 mois
  const quarterMonthBuckets = computed<Bucket[]>(() => {
    const res: Bucket[] = [];
    if (timeScale.value !== 'quarter') return res;

    const start = new Date(minDate.value);
    const end = new Date(maxDate.value);
    const oneDay = 24 * 60 * 60 * 1000;

    const d = new Date(start);
    d.setDate(1);
    while (d <= end) {
      const monthStart = new Date(d);
      const monthEnd = new Date(d);
      monthEnd.setMonth(monthEnd.getMonth() + 1, 0);

      const label = monthStart.toLocaleDateString('fr-FR', { month: 'short' });

      const left =
        ((monthStart.getTime() - minDate.value.getTime()) / totalMs.value) *
        100;
      const width =
        ((monthEnd.getTime() - monthStart.getTime() + oneDay) / totalMs.value) *
        100;

      res.push({ left, width, label });
      d.setMonth(d.getMonth() + 1, 1);
    }
    return res;
  });

  // Semaines (ligne 3 - vue trimestre)
  const quarterWeekBuckets = computed<Bucket[]>(() => {
    const res: Bucket[] = [];
    if (timeScale.value !== 'quarter') return res;

    const start = new Date(minDate.value);
    const end = new Date(maxDate.value);
    const oneDay = 24 * 60 * 60 * 1000;

    let weekStart = new Date(start);
    while (weekStart <= end) {
      const weekEnd = new Date(weekStart.getTime() + 6 * oneDay);
      const weekNumber = getIsoWeekNumber(weekStart);
      const left =
        ((weekStart.getTime() - minDate.value.getTime()) / totalMs.value) *
        100;
      const width =
        ((weekEnd.getTime() - weekStart.getTime() + oneDay) / totalMs.value) *
        100;
      res.push({ left, width, label: `S${weekNumber}` });
      weekStart = new Date(weekStart.getTime() + 7 * oneDay);
    }
    return res;
  });

  return {
    referenceDate,
    baseMinDate,
    baseMaxDate,
    minDate,
    maxDate,
    totalMs,
    getIsoWeekNumber,
    timeOfDayBuckets,
    weekWeekBuckets,
    weekDayBuckets,
    monthMonthBuckets,
    monthWeekBuckets,
    monthDayBuckets,
    quarterMonthBuckets,
    quarterWeekBuckets,
  };
}
