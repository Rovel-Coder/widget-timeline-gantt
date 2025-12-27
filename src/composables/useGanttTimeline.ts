import { computed } from 'vue';
import type { Ref } from 'vue';

type TimeScale = 'week' | 'month' | 'quarter' | 'p4s';

export type Bucket = { left: number; width: number; label: string; date?: Date };
export type TimeOfDayBucket = Bucket & { slot: 'morning' | 'afternoon' | 'night' };

type TimelineArgs = {
  timeScale: Ref<TimeScale>;
  offset: Ref<number>;
  referenceDateSource: () => Date;
  dayStartHour: Ref<number>;
};

// Lundi de la semaine ISO 1 de 2025 : du lundi 30/12/2024 au dimanche 05/01/2025.[web:114][web:127]
const P4S_BASE = new Date(2024, 11, 30);
P4S_BASE.setHours(0, 0, 0, 0);

export function useGanttTimeline(args: TimelineArgs) {
  const { timeScale, offset, referenceDateSource, dayStartHour } = args;

  // date de référence issue des tâches (toujours exposée si besoin)
  const referenceDate = computed(() => referenceDateSource());

  // date du jour normalisée
  const todayRef = computed(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // bornes "de base" avant offset
  const baseMinDate = computed(() => {
    const d = new Date(todayRef.value);

    if (timeScale.value === 'week') {
      // lundi de la semaine courante (ISO).[web:73]
      const day = d.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(d);
      monday.setDate(monday.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);
      return monday;
    }

    if (timeScale.value === 'p4s') {
      // base fixe P4S = lundi semaine 1.
      return new Date(P4S_BASE);
    }

    if (timeScale.value === 'month') {
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    // trimestre
    const q = Math.floor(d.getMonth() / 3);
    const qStart = new Date(d.getFullYear(), q * 3, 1);
    qStart.setHours(0, 0, 0, 0);
    return qStart;
  });

  const baseMaxDate = computed(() => {
    const d = new Date(todayRef.value);

    if (timeScale.value === 'week') {
      const day = d.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(d);
      monday.setDate(monday.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      return sunday;
    }

    if (timeScale.value === 'p4s') {
      // P4S : 4 semaines pleines à partir de P4S_BASE = 28 jours.[web:73]
      const sundayS4 = new Date(P4S_BASE);
      sundayS4.setDate(sundayS4.getDate() + 27);
      sundayS4.setHours(23, 59, 59, 999);
      return sundayS4;
    }

    if (timeScale.value === 'month') {
      const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      lastDayOfMonth.setHours(23, 59, 59, 999);
      return lastDayOfMonth;
    }

    // trimestre
    const q = Math.floor(d.getMonth() / 3);
    const qEnd = new Date(d.getFullYear(), q * 3 + 3, 0);
    qEnd.setHours(23, 59, 59, 999);
    return qEnd;
  });

  // bornes effectives selon offset
  const minDate = computed(() => {
    const k = offset.value;

    if (timeScale.value === 'week') {
      const d = new Date(baseMinDate.value);
      d.setDate(d.getDate() + k * 7);
      return d;
    }

    if (timeScale.value === 'p4s') {
      // 1 offset P4S = 1 semaine, mais on positionne l'offset par blocs de 4 dans GanttChart.
      const d = new Date(baseMinDate.value);
      d.setDate(d.getDate() + k * 7);
      return d;
    }

    if (timeScale.value === 'month') {
      const d = new Date(todayRef.value);
      d.setMonth(d.getMonth() + k, 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    // trimestre
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

    if (timeScale.value === 'week') {
      const d = new Date(baseMaxDate.value);
      d.setDate(d.getDate() + k * 7);
      return d;
    }

    if (timeScale.value === 'p4s') {
      const d = new Date(baseMaxDate.value);
      d.setDate(d.getDate() + k * 7);
      return d;
    }

    if (timeScale.value === 'month') {
      const d = new Date(todayRef.value);
      d.setMonth(d.getMonth() + k + 1, 0);
      d.setHours(23, 59, 59, 999);
      return d;
    }

    // trimestre
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

  // utilitaire ISO semaine.[web:50]
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

    // On aligne les semaines sur le lundi qui couvre minDate
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

  // Trimestre (ligne 1 - vue trimestre)
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
    todayRef,
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

