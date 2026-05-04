// monthly-summary.component.spec.ts
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';

// ✅ ודאי שהנתיב נכון אצלך. בדרך כלל זה monthly-summary.component
import { MonthlySummaryComponent } from './monthly-summary';

import { Auth } from '@angular/fire/auth';
import * as supa from '../../services/supabaseClient.service';
import { DB_TENANT } from '../../services/db-tenant.token';

type SupaResponse<T> = { data: T | null; error: any | null };


function makeThenableQuery<T>(
  table: string,
  response: SupaResponse<T>,
  callsSink: any[]
) {
  // Supabase query builder is "thenable" (await works on it).
  const state: any = {
    table,
    selects: [] as string[],
    gte: [] as Array<{ col: string; val: any }>,
    lte: [] as Array<{ col: string; val: any }>,
    order: [] as Array<{ col: string; opts?: any }>,
  };

  const qb: any = {
    select(sel: string) {
      state.selects.push(sel);
      return qb;
    },
    gte(col: string, val: any) {
      state.gte.push({ col, val });
      return qb;
    },
    lte(col: string, val: any) {
      state.lte.push({ col, val });
      return qb;
    },
    order(col: string, opts?: any) {
      state.order.push({ col, opts });
      return qb;
    },
    // Make it awaitable
    then(onFulfilled: any, onRejected: any) {
      callsSink.push(state);
      return Promise.resolve(response).then(onFulfilled, onRejected);
    },
    catch(onRejected: any) {
      return qb.then((x: any) => x, onRejected);
    },
  };

  return qb;
}

function makeMockDb(responsesByTable: Record<string, SupaResponse<any>>) {
  const calls: any[] = [];

  const dbc: any = {
    from(table: string) {
      const resp = responsesByTable[table] ?? { data: [], error: null };
      return makeThenableQuery(table, resp, calls);
    },
    __calls: calls,
  };

  return dbc;
}

describe('MonthlySummaryComponent', () => {
  let fixture: ComponentFixture<MonthlySummaryComponent>;
  let component: MonthlySummaryComponent;

  const originalAlert = window.alert;

  // ✅ Mock בסיסי ל-Auth (מספיק ל-UT)
  const authMock: Partial<Auth> = {
    // אם אצלך CurrentUserService מאזין ל-onAuthStateChanged:
    // @ts-ignore
    onAuthStateChanged: () => () => {},
    // @ts-ignore
    currentUser: null,
  };

  beforeEach(async () => {
    // Silence alert in tests
    window.alert = jasmine.createSpy('alert') as any;

    await TestBed.configureTestingModule({
      imports: [MonthlySummaryComponent], // standalone component
      providers: [
        { provide: Auth, useValue: authMock },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    window.alert = originalAlert;
  });


function createComponentWithDb(mockDb: any) {
  TestBed.overrideProvider(DB_TENANT, { useValue: () => mockDb });

  fixture = TestBed.createComponent(MonthlySummaryComponent);
  component = fixture.componentInstance;
  fixture.detectChanges();
}


  it('should create', () => {
    const db = makeMockDb({});
    createComponentWithDb(db);
    expect(component).toBeTruthy();
  });

  describe('statusClass', () => {
    beforeEach(() => {
      const db = makeMockDb({});
      createComponentWithDb(db);
    });

    it('maps statuses to css classes', () => {
      expect(component.statusClass('אושר')).toBe('status-approved');
      expect(component.statusClass('בוטל')).toBe('status-canceled');
      expect(component.statusClass('ממתין לאישור')).toBe('status-pending');
      expect(component.statusClass('הושלם')).toBe('status-done');
      expect(component.statusClass(null)).toBe('status-default');
      expect(component.statusClass(undefined)).toBe('status-default');
    });
  });

  describe('instructors computed', () => {
    beforeEach(() => {
      const db = makeMockDb({});
      createComponentWithDb(db);
    });

    it('returns unique, trimmed, sorted instructor names', () => {
      component.lessons.set([
        {
          lesson_id: '1' as any,
          lesson_type: 'רגיל',
          status: 'אושר',
          occur_date: '2026-01-01',
          start_time: '10:00',
          end_time: '10:45',
          instructor_name: '  דנה  ',
        } as any,
        {
          lesson_id: '2' as any,
          lesson_type: 'רגיל',
          status: 'אושר',
          occur_date: '2026-01-02',
          start_time: '11:00',
          end_time: '11:45',
          instructor_name: 'דנה',
        } as any,
        {
          lesson_id: '3' as any,
          lesson_type: 'השלמה',
          status: 'ממתין לאישור',
          occur_date: '2026-01-03',
          start_time: '12:00',
          end_time: '12:45',
          instructor_name: 'אביב',
        } as any,
        {
          lesson_id: '4' as any,
          lesson_type: 'רגיל',
          status: 'בוטל',
          occur_date: '2026-01-04',
          start_time: '13:00',
          end_time: '13:45',
          instructor_name: '  ', // ignored
        } as any,
      ]);

      expect(component.instructors()).toEqual(['אביב', 'דנה']);
    });
  });

  describe('filteredLessons', () => {
    beforeEach(() => {
      const db = makeMockDb({});
      createComponentWithDb(db);

      component.lessons.set([
        {
          lesson_id: 'a' as any,
          lesson_type: 'רגיל',
          status: 'אושר',
          occur_date: '2026-01-10',
          start_time: '10:00',
          end_time: '10:45',
          child_full_name: 'נועם כהן',
          instructor_name: 'דנה',
          riding_type: 'פרטי',
          riding_type_code: 'private',
          riding_type_name: 'פרטי',
        } as any,
        {
          lesson_id: 'b' as any,
          lesson_type: 'השלמה',
          status: 'ממתין לאישור',
          occur_date: '2026-01-11',
          start_time: '11:00',
          end_time: '11:45',
          child_full_name: 'שירה לוי',
          instructor_name: 'אביב',
          riding_type: 'קבוצתי',
          riding_type_code: 'group',
          riding_type_name: 'קבוצתי',
        } as any,
        {
          lesson_id: 'c' as any,
          lesson_type: 'רגיל',
          status: 'הושלם',
          occur_date: '2026-01-12',
          start_time: '12:00',
          end_time: '12:45',
          child_full_name: 'עדי מזרחי',
          instructor_name: 'דנה',
          riding_type: 'זוגי',
          riding_type_code: 'pair',
          riding_type_name: 'זוגי',
        } as any,
        {
          lesson_id: 'd' as any,
          lesson_type: 'רגיל',
          status: 'בוטל',
          occur_date: '2026-01-13',
          start_time: '13:00',
          end_time: '13:45',
          child_full_name: 'נועם כהן',
          instructor_name: 'דנה',
          riding_type: 'פרטי',
          riding_type_code: 'private',
          riding_type_name: 'פרטי',
        } as any,
      ]);
    });

    it('filters by type regular/makeup', () => {
      component.typeFilter.set('regular');
      expect(component.filteredLessons().map((x) => x.lesson_id)).toEqual(['a', 'c', 'd']);

      component.typeFilter.set('makeup');
      expect(component.filteredLessons().map((x) => x.lesson_id)).toEqual(['b']);

      component.typeFilter.set('all');
      expect(component.filteredLessons().length).toBe(4);
    });

    it('filters by status groups (done includes אושר + הושלם)', () => {
      component.statusFilter.set('done');
      expect(component.filteredLessons().map((x) => x.lesson_id)).toEqual(['a', 'c']);

      component.statusFilter.set('pending');
      expect(component.filteredLessons().map((x) => x.lesson_id)).toEqual(['b']);

      component.statusFilter.set('canceled');
      expect(component.filteredLessons().map((x) => x.lesson_id)).toEqual(['d']);

      component.statusFilter.set('approved');
      expect(component.filteredLessons().map((x) => x.lesson_id)).toEqual(['a']);
    });

    it('filters by instructor name (exact match after trim)', () => {
      component.instructorFilter.set('דנה');
      expect(component.filteredLessons().map((x) => x.lesson_id)).toEqual(['a', 'c', 'd']);

      component.instructorFilter.set('אביב');
      expect(component.filteredLessons().map((x) => x.lesson_id)).toEqual(['b']);
    });

    it('filters by search across child name, lesson type, riding type, instructor', () => {
      component.search.set('נועם');
      expect(component.filteredLessons().map((x) => x.lesson_id)).toEqual(['a', 'd']);

      component.search.set('השלמה');
      expect(component.filteredLessons().map((x) => x.lesson_id)).toEqual(['b']);

      component.search.set('דנה');
      expect(component.filteredLessons().map((x) => x.lesson_id)).toEqual(['a', 'c', 'd']);

      component.search.set('זוגי');
      expect(component.filteredLessons().map((x) => x.lesson_id)).toEqual(['c']);
    });

    it('clearSearch resets filters', () => {
      component.search.set('נועם');
      component.typeFilter.set('makeup');
      component.statusFilter.set('done');
      component.instructorFilter.set('דנה');

      component.clearSearch();

      expect(component.search()).toBe('');
      expect(component.typeFilter()).toBe('all');
      expect(component.statusFilter()).toBe('all');
      expect(component.instructorFilter()).toBe('all');
    });
  });

  describe('kpis computed', () => {
    beforeEach(() => {
      const db = makeMockDb({});
      createComponentWithDb(db);
    });

    it('computes income sum, pending from occurrences, canceled includes exceptions, successPct from occWithAttendance', () => {
      component.payments.set([
        { amount: 100, date: '2026-01-01' } as any,
        { amount: null, date: '2026-01-02' } as any,
        { amount: 50, date: '2026-01-03' } as any,
      ]);

      component.occurrences.set([
        { occur_date: '2026-01-01', status: 'ממתין לאישור', lesson_id: 'x' } as any,
        { occur_date: '2026-01-02', status: 'אושר', lesson_id: 'y' } as any,
        { occur_date: '2026-01-03', status: 'ממתין לאישור', lesson_id: 'z' } as any,
      ]);

      component.cancelExceptions.set([
        { occur_date: '2026-01-05', status: 'בוטל', lesson_id: 'c1', note: '' } as any,
      ]);

      component.occWithAttendance.set([
        { occur_date: '2026-01-01', status: 'אושר', lesson_id: '1' } as any,
        { occur_date: '2026-01-02', status: 'הושלם', lesson_id: '2' } as any,
        { occur_date: '2026-01-03', status: 'ממתין לאישור', lesson_id: '3' } as any,
        { occur_date: '2026-01-04', status: 'בוטל', lesson_id: '4' } as any,
      ]);

      component.lessons.set([
        {
          lesson_id: '1' as any,
          lesson_type: 'רגיל',
          status: 'אושר',
          occur_date: '2026-01-01',
          start_time: '10:00',
          end_time: '11:00',
          riding_type_code: 'private',
          riding_type_name: 'פרטי',
        } as any,
        {
          lesson_id: '2' as any,
          lesson_type: 'רגיל',
          status: 'הושלם',
          occur_date: '2026-01-02',
          start_time: '12:00',
          end_time: '12:30',
          riding_type_code: 'group',
          riding_type_name: 'קבוצתי',
        } as any,
        {
          lesson_id: '3' as any,
          lesson_type: 'השלמה',
          status: 'בוטל',
          occur_date: '2026-01-03',
          start_time: '13:00',
          end_time: '13:45',
          riding_type_code: 'private',
          riding_type_name: 'פרטי',
        } as any,
      ]);

      const k = component.kpis();

      expect(k.income).toBe(150);
      expect(k.pending).toBe(2);
      expect(k.canceled).toBe(2);
      expect(k.done).toBe(2);
      expect(k.workedHours).toBe('1:30');
      expect(k.successPct).toBe(50);

      expect(k.privCount).toBe(2);
      expect(k.groupCount).toBe(1);
    });

    it('returns zero-state when no lessons and no cancels, but still calculates successPct + income', () => {
      component.lessons.set([]);
      component.cancelExceptions.set([]);
      component.payments.set([{ amount: 40, date: '2026-01-01' } as any]);

      component.occWithAttendance.set([
        { occur_date: '2026-01-01', status: 'אושר' } as any,
        { occur_date: '2026-01-02', status: 'בוטל' } as any,
      ]);

      const k = component.kpis();
      expect(k.income).toBe(40);
      expect(k.workedHours).toBe('0:00');
      expect(k.done).toBe(0);
      expect(k.canceled).toBe(0);
      expect(k.pending).toBe(0);
      expect(k.privCount).toBe(0);
      expect(k.groupCount).toBe(0);
      expect(k.successPct).toBe(50);
    });
  });

  describe('computeInsights', () => {
    beforeEach(() => {
      const db = makeMockDb({});
      createComponentWithDb(db);
    });

    it('uses occWithAttendance for total/success/cancel pct and payments for avgIncome', () => {
      component.payments.set([
        { amount: 100, date: '2026-01-01' } as any,
        { amount: 50, date: '2026-01-02' } as any,
      ]);

      component.occWithAttendance.set([
        { occur_date: '2026-01-01', status: 'אושר' } as any,
        { occur_date: '2026-01-02', status: 'הושלם' } as any,
        { occur_date: '2026-01-03', status: 'בוטל' } as any,
        { occur_date: '2026-01-04', status: 'ממתין לאישור' } as any,
      ]);

      component.computeInsights([
        { lesson_id: '1' as any, child_full_name: 'נועה כהן' } as any,
        { lesson_id: '2' as any, child_full_name: 'נועה כהן' } as any,
        { lesson_id: '3' as any, child_full_name: 'אורי לוי' } as any,
      ]);

      const ins = component.insights();
      expect(ins.totalLessons).toBe(4);
      expect(ins.cancelPct).toBe(25);
      expect(ins.successPct).toBe(50);
      expect(ins.newStudents).toBe(2);
      expect(ins.avgIncome).toBe(38);
    });

    it('sets zeros if no occWithAttendance rows', () => {
      component.payments.set([{ amount: 100, date: '2026-01-01' } as any]);
      component.occWithAttendance.set([]);

      component.computeInsights([{ lesson_id: '1' as any, child_full_name: 'x' } as any]);

      expect(component.insights()).toEqual({
        totalLessons: 0,
        cancelPct: 0,
        successPct: 0,
        newStudents: 0,
        avgIncome: 0,
      });
    });
  });

  describe('buildCharts basics', () => {
    beforeEach(() => {
      const db = makeMockDb({});
      createComponentWithDb(db);
    });

    it('builds success_pct by month from occWithAttendance; pending from occurrences; income from payments', () => {
      component.occWithAttendance.set([
        { occur_date: '2026-01-01', status: 'אושר' } as any,
        { occur_date: '2026-01-02', status: 'בוטל' } as any,
        { occur_date: '2026-01-03', status: 'הושלם' } as any,
        { occur_date: '2026-02-01', status: 'בוטל' } as any,
      ]);

      component.occurrences.set([
        { occur_date: '2026-01-10', status: 'ממתין לאישור' } as any,
        { occur_date: '2026-01-11', status: 'אושר' } as any,
        { occur_date: '2026-02-10', status: 'ממתין לאישור' } as any,
        { occur_date: '2026-02-11', status: 'ממתין לאישור' } as any,
      ]);

      component.payments.set([
        { date: '2026-01-05', amount: 100 } as any,
        { date: '2026-02-05', amount: 40 } as any,
      ]);

      component.lessons.set([
        {
          lesson_id: 'l1' as any,
          status: 'אושר',
          occur_date: '2026-01-01',
          start_time: '10:00',
          end_time: '11:00',
          riding_type_code: 'private',
          riding_type_name: 'פרטי',
        } as any,
        {
          lesson_id: 'l2' as any,
          status: 'בוטל',
          occur_date: '2026-01-02',
          start_time: '12:00',
          end_time: '12:45',
          riding_type_code: 'group',
          riding_type_name: 'קבוצתי',
        } as any,
      ]);

      (component as any).buildCharts();

      const successJan = component.kpiCharts.success_pct[0].value;
      expect(successJan).toBe(67);

      const pendingJan = component.kpiCharts.pending[0].value;
      expect(pendingJan).toBe(1);

      const pendingFeb = component.kpiCharts.pending[1].value;
      expect(pendingFeb).toBe(2);

      expect(component.kpiCharts.income[0].value).toBe(100);
      expect(component.kpiCharts.income[1].value).toBe(40);

      const pvsg = component.kpiCharts.priv_vs_group;
      expect(pvsg.find((x) => x.label === 'פרטי')?.value).toBe(component.kpis().privCount);
    });

    it('privVsGroupCharts is cumulative per month', () => {
      component.lessons.set([
        {
          lesson_id: 'l1' as any,
          occur_date: '2026-01-01',
          status: 'אושר',
          riding_type_code: 'private',
          riding_type_name: 'פרטי',
        } as any,
        {
          lesson_id: 'l2' as any,
          occur_date: '2026-02-01',
          status: 'אושר',
          riding_type_code: 'group',
          riding_type_name: 'קבוצתי',
        } as any,
        {
          lesson_id: 'l3' as any,
          occur_date: '2026-02-02',
          status: 'אושר',
          riding_type_code: 'private',
          riding_type_name: 'פרטי',
        } as any,
      ]);

      (component as any).buildCharts();

      const series = component.privVsGroupCharts();
      expect(series.priv[0].value).toBe(1);
      expect(series.group[0].value).toBe(0);
      expect(series.priv[1].value).toBe(2);
      expect(series.group[1].value).toBe(1);
    });
  });

  describe('geometry helpers', () => {
    beforeEach(() => {
      const db = makeMockDb({});
      createComponentWithDb(db);
    });

    it('maxIndex / isMaxIndex works for privVsGroupCharts series', () => {
      component.privVsGroupCharts.set({
        priv: [
          { label: 'a', value: 1 },
          { label: 'b', value: 5 },
          { label: 'c', value: 3 },
        ],
        group: [
          { label: 'a', value: 2 },
          { label: 'b', value: 1 },
        ],
      });

      expect(component.maxIndex('priv')).toBe(1);
      expect(component.isMaxIndex('priv', 1)).toBeTrue();
      expect(component.isMaxIndex('priv', 0)).toBeFalse();

      expect(component.maxIndex('group')).toBe(0);
      expect(component.isMaxIndex('group', 0)).toBeTrue();
    });

    it('buildPolylineFor returns "x,y x,y ..." and empty for empty series', () => {
      const pts = [
        { label: 'a', value: 1 },
        { label: 'b', value: 2 },
      ];
      const poly = component.buildPolylineFor(pts, 2);
      expect(poly).toContain(',');
      expect(poly.split(' ').length).toBe(2);

      expect(component.buildPolylineFor([], 1)).toBe('');
    });

    it('getPointX centers when total <= 1', () => {
      const x = component.getPointX(0, 1);
      expect(x).toBe((component.axisLeft + component.axisRight) / 2);
    });

    it('getBarHeight returns percent relative to max', () => {
      component.kpiCharts.done = [
        { label: 'a', value: 10 },
        { label: 'b', value: 20 },
      ];
      component.selectedKpi = 'done';

      expect(component.getBarHeight({ label: 'a', value: 10 })).toBeCloseTo(50, 5);
      expect(component.getBarHeight({ label: 'b', value: 20 })).toBeCloseTo(100, 5);
    });
  });

  describe('grouping helpers', () => {
    beforeEach(() => {
      const db = makeMockDb({});
      createComponentWithDb(db);

      component.lessons.set([
        {
          lesson_id: 'L1' as any,
          occur_date: '2026-01-01',
          start_time: '10:00',
          end_time: '10:45',
          instructor_name: 'דנה',
          child_full_name: 'א',
          status: 'אושר',
          lesson_type: 'רגיל',
        } as any,
        {
          lesson_id: 'L1' as any,
          occur_date: '2026-01-01',
          start_time: '10:00',
          end_time: '10:45',
          instructor_name: 'דנה',
          child_full_name: 'ב',
          status: 'אושר',
          lesson_type: 'רגיל',
        } as any,
        {
          lesson_id: 'L2' as any,
          occur_date: '2026-01-01',
          start_time: '11:00',
          end_time: '11:45',
          instructor_name: 'דנה',
          child_full_name: 'ג',
          status: 'אושר',
          lesson_type: 'רגיל',
        } as any,
      ]);
    });

    it('isSameLessonAsPrev compares lesson_id', () => {
      expect(component.isSameLessonAsPrev(0)).toBeFalse();
      expect(component.isSameLessonAsPrev(1)).toBeTrue();
      expect(component.isSameLessonAsPrev(2)).toBeFalse();
    });

    it('group helpers detect same group by date/time/instructor', () => {
      expect(component.isGroupFirst(0)).toBeTrue();
      expect(component.isGroupContinuation(0)).toBeFalse();

      expect(component.isGroupFirst(1)).toBeFalse();
      expect(component.isGroupContinuation(1)).toBeTrue();
      expect(component.isGroupLast(1)).toBeTrue();

      expect(component.isGroupFirst(2)).toBeTrue();
      expect(component.isGroupLast(2)).toBeTrue();
      expect(component.isGroupMiddle(2)).toBeFalse();
    });
  });

  describe('load()', () => {
    it('loads month range and calls supabase with correct tables and date filters', fakeAsync(() => {
      const rawLessons = [
        {
          lesson_id: 'x',
          lesson_date: '2026-01-10',
          start_time: '10:00:00',
          end_time: '10:45:00',
          status: 'אושר',
          child_name: 'נועם כהן',
          instructor_name: 'דנה',
          riding_type_code: 'private',
          riding_type_name: 'פרטי',
          approval_id: 'a1',
          is_cancellation: false,
          is_makeup_target: false,
          lesson_type: 'רגיל',
        },
      ];

      const db = makeMockDb({
        lessons_schedule_view: { data: rawLessons, error: null },
        payments: { data: [{ amount: 100, date: '2026-01-15' }], error: null },
        lesson_occurrence_exceptions: { data: [], error: null },
        lessons_occurrences: { data: [{ occur_date: '2026-01-20', status: 'ממתין לאישור' }], error: null },
        lessons_occurrences_with_attendance: {
          data: [
            { occur_date: '2026-01-10', status: 'אושר', lesson_id: 'x' },
            { occur_date: '2026-01-11', status: 'בוטל', lesson_id: 'y' },
          ],
          error: null,
        },
      });

      createComponentWithDb(db);

      component.mode.set('month');
      component.year = 2026;
      component.month = 1;

      component.load();
      flushMicrotasks();

      const calls = (db as any).__calls as any[];
      const byTable: Record<string, any> = {};
      for (const c of calls) byTable[c.table] = c;

      expect(Object.keys(byTable)).toEqual(
        jasmine.arrayContaining([
          'lessons_schedule_view',
          'payments',
          'lesson_occurrence_exceptions',
          'lessons_occurrences',
          'lessons_occurrences_with_attendance',
        ])
      );

      const from = '2025-12-31';
      const to = '2026-01-30';

      expect(byTable['lessons_schedule_view'].gte).toEqual(
        jasmine.arrayContaining([{ col: 'lesson_date', val: from }])
      );
      expect(byTable['lessons_schedule_view'].lte).toEqual(
        jasmine.arrayContaining([{ col: 'lesson_date', val: to }])
      );

      expect(byTable['payments'].gte).toEqual(jasmine.arrayContaining([{ col: 'date', val: from }]));
      expect(byTable['payments'].lte).toEqual(jasmine.arrayContaining([{ col: 'date', val: to }]));

      expect(byTable['lessons_occurrences'].gte).toEqual(
        jasmine.arrayContaining([{ col: 'occur_date', val: from }])
      );
      expect(byTable['lessons_occurrences'].lte).toEqual(
        jasmine.arrayContaining([{ col: 'occur_date', val: to }])
      );

      const lessons = component.lessons();
      expect(lessons.length).toBe(1);
      expect(lessons[0].lesson_id).toBe('x' as any);
      expect(lessons[0].start_time).toBe('10:00');
      expect(lessons[0].end_time).toBe('10:45');
      expect(lessons[0].status).toBe('אושר');
      expect(lessons[0].lesson_type).toBe('רגיל');
      expect(lessons[0].riding_type).toBe('פרטי');

      expect(component.insights().totalLessons).toBe(2);
      expect(component.insights().successPct).toBe(50);
      expect(component.insights().cancelPct).toBe(50);
    }));

    it('alerts on supabase error and stops loading', fakeAsync(() => {
      const db = makeMockDb({
        lessons_schedule_view: { data: null, error: { message: 'boom' } },
        payments: { data: [], error: null },
        lesson_occurrence_exceptions: { data: [], error: null },
        lessons_occurrences: { data: [], error: null },
        lessons_occurrences_with_attendance: { data: [], error: null },
      });

      createComponentWithDb(db);

      component.mode.set('month');
      component.year = 2026;
      component.month = 1;

      component.load();
      flushMicrotasks();

      expect(component.loading).toBeFalse();
      expect(window.alert as any).toHaveBeenCalled();
    }));
  });
});
