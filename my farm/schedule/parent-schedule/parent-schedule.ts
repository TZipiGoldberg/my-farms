// src/app/pages/schedule/parent-schedule/parent-schedule.ts

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ScheduleComponent } from '../../../custom-widget/schedule/schedule';
import type { ScheduleItem } from '../../../models/schedule-item.model';
import type { Lesson } from '../../../models/lesson-schedule.model';
import type { EventClickArg } from '@fullcalendar/core';
<<<<<<< HEAD
import { MatTooltipModule, MatDialogModule } from '@angular/material/tooltip';
import { UiDialogService } from '../../../services/ui-dialog.service';

imports: [
  CommonModule,
  ScheduleComponent,
  MatDialogModule,
  MatTooltipModule
]

import { MatDialog, MatDialogModule } from '@angular/material/dialog';



=======

import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';

import { UiDialogService } from '../../../services/ui-dialog.service';

>>>>>>> 413ba46ef3b70cfeebd2a04621f54cbfcbaa6f9e
import {
  dbTenant,
  ensureTenantContextReady,
  getCurrentUserData,
} from '../../../services/legacy-compat';

import {
  CancelLessonDialogComponent,
  CancelLessonDialogData,
} from './cancel-lesson-dialog/cancel-lesson-dialog.component';

@Component({
  selector: 'app-parent-schedule',
  standalone: true,
  templateUrl: './parent-schedule.html',
  styleUrls: ['./parent-schedule.scss'],
  imports: [
    CommonModule,
    ScheduleComponent,
    MatDialogModule,
    MatTooltipModule,
  ],
})
export class ParentScheduleComponent implements OnInit {
  children: Array<{
    child_uuid: string;
    first_name: string;
    last_name: string;
    status?: string | null;
  }> = [];

  nextCanceledLessonNote: string | null = null;

  lessons: Lesson[] = [];
  filteredLessons: Lesson[] = [];

  weekView = true;
  startDate: string = '';
  endDate: string = '';

  items: ScheduleItem[] = [];
  selectedChildId: string = 'all';
  dropdownOpen = false;

  toastMessage: string | null = null;

  constructor(
    private dialog: MatDialog,
    private ui: UiDialogService,
  ) {}

  showToast(msg: string, ms = 3000) {
    this.toastMessage = msg;
    setTimeout(() => (this.toastMessage = null), ms);
  }

  async ngOnInit() {
    await ensureTenantContextReady();

    this.startDate = this.getStartOfWeek();
    this.endDate = this.getEndOfWeek();

    await this.loadChildren();
    await this.loadLessons();

    this.filterLessons();
    this.setScheduleItems();
    this.calcNextCanceledLesson();
  }

  /* ===================== Dates ===================== */

  private getStartOfWeek(): string {
    const today = new Date();
    // ראשון (בהנחה שראשון=1, שבת=6 לפי getDay() של JS: 0=Sunday)
    const diff = today.getDate() - today.getDay() + 1;
    const start = new Date(today);
    start.setDate(diff);
    return start.toISOString().slice(0, 10);
  }

  private getEndOfWeek(): string {
    const start = new Date(this.getStartOfWeek());
    start.setDate(start.getDate() + 6);
    return start.toISOString().slice(0, 10);
  }

  private calcNextCanceledLesson() {
    const now = new Date();
    const relevant = this.filteredLessons
      .filter((l: Lesson) => {
        const status = String(l.status || '').trim();
        const canceledStatuses = [
          'בוטל',
          'מבוטל',
          'בקשת ביטול',
          'ממתין לאישור',
          'ממתין לאישור מזכירה',
        ];

        if (!canceledStatuses.includes(status)) return false;
        if (!l.start_datetime) return false;

        const start = new Date(l.start_datetime);
        if (isNaN(start.getTime())) return false;

        return start > now; // רק עתידי
      })
      .sort((a: Lesson, b: Lesson) => {
        const da = new Date(a.start_datetime!).getTime();
        const db = new Date(b.start_datetime!).getTime();
        return da - db;
      });

    if (!relevant.length) {
      this.nextCanceledLessonNote = null;
      return;
    }

    const lesson = relevant[0];
    const childName = lesson.child_name || 'הילד';

    const date = new Date(lesson.start_datetime!);
    const formattedDate = date.toLocaleDateString('he-IL', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    this.nextCanceledLessonNote = `${childName} – השיעור הקרוב בוטל בתאריך ${formattedDate}`;
  }

  /* ===================== Load Children ===================== */

  private async loadChildren() {
    try {
      const user = await getCurrentUserData();
      if (!user?.uid) {
        this.children = [];
        return;
      }

      const dbc = dbTenant();

      const { data: parent, error: e1 } = await dbc
        .from('parents')
        .select('uid')
        .eq('uid', user.uid)
        .maybeSingle();

      if (e1 || !parent) {
        console.error('Parent not found', e1);
        this.children = [];
        return;
      }

      const { data: kids, error: e2 } = await dbc
        .from('children')
        .select('child_uuid, first_name, last_name, status')
        .eq('parent_uid', parent.uid)
        .in('status', ['Active']);

      if (e2) {
        console.error('Error loading children:', e2);
        this.children = [];
        return;
      }

      this.children = (kids ?? []).map((k: any) => ({
        child_uuid: String(k.child_uuid ?? ''),
        first_name: String(k.first_name ?? ''),
        last_name: String(k.last_name ?? ''),
        status: k.status ?? null,
      }));
    } catch (err) {
      console.error('Unexpected error loading children:', err);
      this.children = [];
    }
  }

  /* ===================== Load Lessons ===================== */

  private async loadLessons() {
    const dbc = dbTenant();
    const childIds = this.children.map(c => c.child_uuid).filter(Boolean);

    if (!childIds.length) {
      this.lessons = [];
      return;
    }

    const fromDate = new Date(Date.now() - 8 * 7 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    const toDate = new Date(Date.now() + 8 * 7 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    const { data, error } = await dbc
      .from('lessons_occurrences')
      .select(`
        lesson_id,
        occur_date,
        child_id,
        instructor_id,
        lesson_type,
        status,
        day_of_week,
        start_time,
        end_time,
        start_datetime,
        end_datetime,
        lesson_occurrence_exceptions (
          is_makeup_allowed
        )
      `)
      .in('child_id', childIds)
      .gte('occur_date', fromDate)
      .lte('occur_date', toDate)
      .order('start_datetime', { ascending: true });

    if (error) {
      console.error('Error loading lesson occurrences:', error);
      this.lessons = [];
      return;
    }

    const rows = (data ?? []) as Lesson[];

    // instructors names
    const instructorIds = Array.from(
      new Set(rows.map(r => r.instructor_id).filter((x): x is string => !!x)),
    );

    let instructorNameById: Record<string, string> = {};
    if (instructorIds.length) {
      const { data: inst } = await dbc
        .from('instructors')
        .select('id_number, first_name, last_name')
        .in('id_number', instructorIds);

      for (const row of (inst ?? []) as any[]) {
        const first = String(row.first_name ?? '').trim();
        const last = String(row.last_name ?? '').trim();
        instructorNameById[String(row.id_number)] = [first, last].filter(Boolean).join(' ');
      }
    }

    // pending cancel requests map
    const { data: pending } = await dbc
      .from('secretarial_requests')
      .select('lesson_occ_id, from_date')
      .eq('request_type', 'CANCEL_OCCURRENCE')
      .eq('status', 'PENDING');

    const pendingMap = new Set(
      (pending ?? []).map((r: any) => `${r.lesson_occ_id}__${r.from_date}`),
    );

    this.lessons = rows.map((r: any) => {
      const exceptions = (r.lesson_occurrence_exceptions as any[] | null) ?? null;
      const isMakeupAllowed =
        exceptions && exceptions.length > 0 ? exceptions[0]?.is_makeup_allowed ?? null : null;

      const startFallback = this.getLessonDateTime(r.day_of_week, r.start_time);
      const endFallback = this.getLessonDateTime(r.day_of_week, r.end_time);

      const start = this.isoWithTFallback(r.start_datetime, startFallback);
      const end = this.isoWithTFallback(r.end_datetime, endFallback);

      const occurrenceKey = `${r.child_id}__${start}`;

      const child = this.children.find(c => c.child_uuid === r.child_id);
      const hasPendingCancel = pendingMap.has(`${r.lesson_id}__${r.occur_date}`);

      return {
        id: occurrenceKey,
        child_id: r.child_id,
        day_of_week: r.day_of_week,
        start_time: r.start_time,
        end_time: r.end_time,
        lesson_type: r.lesson_type,
        status: r.status,
        instructor_id: r.instructor_id ?? '',
        instructor_name: r.instructor_id ? (instructorNameById[r.instructor_id] ?? '') : '',
        child_color: this.getColorForChild(r.child_id),
        child_name: `${child?.first_name || ''} ${child?.last_name || ''}`.trim(),
        start_datetime: start,
        end_datetime: end,
        lesson_id: r.lesson_id,
        occur_date: r.occur_date,
        hasPendingCancel,
        is_makeup_allowed: isMakeupAllowed,
      } as Lesson;
    });
  }

  private getLessonDateTime(dayName: string, timeStr: string): string {
    const dayMap: Record<string, number> = {
      ראשון: 0,
      שני: 1,
      שלישי: 2,
      רביעי: 3,
      חמישי: 4,
      שישי: 5,
      שבת: 6,
    };

    const today = new Date();
    const currentDay = today.getDay();
    const targetDay = dayMap[dayName] ?? currentDay;
    const diff = (targetDay - currentDay + 7) % 7;

    const eventDate = new Date(today);
    eventDate.setDate(today.getDate() + diff);

    const [hours, minutes] = String(timeStr ?? '00:00').split(':').map(Number);
    eventDate.setHours(hours || 0, minutes || 0, 0, 0);

    return this.toLocalIso(eventDate);
  }

  getColorForChild(child_id: string): string {
    const index = this.children.findIndex(c => c.child_uuid === child_id);
    const colors = ['#d8f3dc', '#fbc4ab', '#cdb4db', '#b5ead7', '#ffdac1'];
    return colors[(index >= 0 ? index : 0) % colors.length];
  }

  /* ===================== UI ===================== */

  selectChild(childId: string) {
    this.selectedChildId = childId;
    this.dropdownOpen = false;
    this.refresh();
  }

  getChildName(childId: string | null): string | null {
    if (!childId || childId === 'all') return null;
    const child = this.children.find(c => c.child_uuid === childId);
    return child ? `${child.first_name} ${child.last_name}`.trim() || null : null;
  }

  toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
  }

  toggleView() {
    this.weekView = !this.weekView;
  }

  refresh() {
    this.loadLessons().then(() => {
      this.filterLessons();
      this.setScheduleItems();
      this.calcNextCanceledLesson();
      this.items = [...this.items];
    });
  }

  private filterLessons() {
    this.filteredLessons =
      !this.selectedChildId || this.selectedChildId === 'all'
        ? this.lessons
        : this.lessons.filter(l => l.child_id === this.selectedChildId);
  }

  private isoWithTFallback(s: string | undefined | null, fallbackIso: string): string {
    if (s && s.trim() !== '') {
      const v = s.trim();
      return v.includes('T') ? v : v.replace(' ', 'T');
    }
    return fallbackIso;
  }

  private toLocalIso(date: Date): string {
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours(),
    )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  /* ===================== Schedule Items ===================== */

  private setScheduleItems() {
    const base = (this.filteredLessons?.length ? this.filteredLessons : this.lessons) || [];
    const uniq = new Map<string, ScheduleItem>();

    for (const lesson of base) {
      let cancelBlockReason: string | null = null;

      if (lesson.lesson_type === 'השלמה') cancelBlockReason = 'לא ניתן לבטל שיעור השלמה';
      else if (lesson.status === 'הושלם') cancelBlockReason = 'לא ניתן לבטל שיעור שהושלם';
      else if (lesson.status === 'בוטל') cancelBlockReason = 'השיעור כבר בוטל';
      else if ((lesson as any).hasPendingCancel) cancelBlockReason = 'כבר נשלחה בקשת ביטול לשיעור זה';

      const startFallback = this.getLessonDateTime(lesson.day_of_week, lesson.start_time);
      const endFallback = this.getLessonDateTime(lesson.day_of_week, lesson.end_time);

      const start = this.isoWithTFallback(lesson.start_datetime, startFallback);
      const end = this.isoWithTFallback(lesson.end_datetime, endFallback);

      if (!start || !end) continue;
      const startMs = Date.parse(start);
      const endMs = Date.parse(end);
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) continue;

      const color = (lesson as any).child_color || this.getColorForChild(lesson.child_id);
      const childLabel = lesson.child_name || this.getChildName(lesson.child_id) || 'ילד';

      let displayTitle = childLabel;

      if ((lesson as any).hasPendingCancel || lesson.status === 'ממתין לאישור') {
        displayTitle = `⏳ ${childLabel} (ממתין לאישור מזכירה)`;
      }

      // שיעור השלמה – תצוגה רגילה עם אייקון
      if (String(lesson.lesson_type) === 'השלמה') {
        displayTitle = `🔁 ${childLabel}`;
      }
      // ביטול אמיתי – תצוגה לפי is_makeup_allowed
      else if (lesson.status === 'בוטל') {
        const mk = (lesson as any).is_makeup_allowed;
        if (mk === true) displayTitle = `🔁 ${childLabel} (להשלמה)`;
        else if (mk === false) displayTitle = `❌ ${childLabel} (לא להשלמה)`;
        else displayTitle = `❌ ${childLabel} (בוטל)`;
      }

      const uid = `${(lesson as any).lesson_id || (lesson as any).id || 'occ'}__${
        lesson.child_id || 'child'
      }__${start}`;

      if (!uniq.has(uid)) {
        uniq.set(uid, {
          id: uid,
          title: displayTitle,
          start,
          end,
          color,
          status: lesson.status,
          meta: {
            lesson_type: lesson.lesson_type,
            status: lesson.status,

            canCancel: !cancelBlockReason,
            cancelBlockReason,

            hasPendingCancel: (lesson as any).hasPendingCancel,
            is_makeup_allowed: (lesson as any).is_makeup_allowed,

            lesson_id: (lesson as any).lesson_id,
            occur_date: (lesson as any).occur_date,

            child_id: lesson.child_id,
            child_name: lesson.child_name,

            instructor_id: lesson.instructor_id,
            instructor_name: (lesson as any).instructor_name,
          },
        } as unknown as ScheduleItem);
      }
    }

    this.items = Array.from(uniq.values()).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }

  /* ===================== FullCalendar Click ===================== */

  onEventClick(arg: EventClickArg) {
    const ev = arg.event;
    const ext: any = ev.extendedProps;

    if (ext?.hasPendingCancel) {
      this.showToast('כבר נשלחה בקשת ביטול לשיעור זה');
      return;
    }

    if (String(ext?.lesson_type) === 'השלמה') {
      this.showToast('אי אפשר לבטל שיעור השלמה');
      return;
    }

    if (ext?.status === 'בוטל') {
      this.showToast('השיעור כבר בוטל');
      return;
    }

    if (ext?.status === 'הושלם') {
      this.showToast('לא ניתן לבטל שיעור שהושלם');
      return;
    }

    if (ext?.status === 'ממתין לאישור') {
      this.showToast('כבר קיימת בקשה לשיעור זה');
      return;
    }

    const data: CancelLessonDialogData = {
      lessonId: ext?.lesson_id,
      childName: ext?.child_name ?? ev.title ?? '',
      instructorName: ext?.instructor_name ?? '',
      dateStr: ev.start ? ev.start.toLocaleDateString('he-IL') : '',
      timeStr: ev.start
        ? ev.start.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
        : '',
      lessonType: ext?.lesson_type ?? '',
      status: ext?.status ?? '',
      canCancel: true,
      isMakeupAllowed: !!ext?.is_makeup_allowed,
    };

    const dialogRef = this.dialog.open(CancelLessonDialogComponent, {
      width: '420px',
      data,
      direction: 'rtl',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (!result?.cancelRequested) return;

      const occurDate = ext?.occur_date;
      if (!occurDate) {
        this.ui.alert('לא נמצא תאריך מופע (occur_date)');
        return;
      }

      this.handleCancelRequest(String(ext?.lesson_id), String(result.reason ?? ''), String(occurDate));
    });
  }

  private markLessonAsPendingCancel(lessonId: string) {
    // עדכון מהיר במבנה המקומי (ללא DB) כדי לחסום מיד עוד לחיצות
    this.lessons = this.lessons.map((l: any) =>
      String(l.lesson_id) === String(lessonId) ? { ...l, hasPendingCancel: true } : l,
    );
    this.filterLessons();
    this.setScheduleItems();
  }

  private async handleCancelRequest(lessonId: string, reason: string, occurDate: string) {
    try {
      await ensureTenantContextReady();

      const user = await getCurrentUserData();
      if (!user?.uid) throw new Error('Missing user uid');
      if (!occurDate) throw new Error('Missing occur date');

      const dbc = dbTenant();

      const { error } = await dbc.rpc('parent_request_cancel_lesson', {
        p_requested_by_uid: String(user.uid),
        p_lesson_id: String(lessonId),
        p_occur_date: String(occurDate),
        p_reason: String(reason ?? ''),
      });

      if (error) throw error;

      this.markLessonAsPendingCancel(lessonId);
      this.ui.alert('בקשת הביטול נשלחה למזכירה.');
      this.showToast('בקשת הביטול נשלחה למזכירה');
      setTimeout(() => this.refresh(), 300);
    } catch (err: any) {
      const msg = err?.message || err?.error?.message || err?.details || '';

      if (String(msg).includes('already exists')) {
        this.showToast('כבר נשלחה בקשת ביטול לשיעור זה');
        await this.refresh();
        return;
      }

      console.error('cancel request error', err);
      this.ui.alert('אירעה שגיאה בעת שליחת בקשת הביטול');
      this.showToast('אירעה שגיאה בעת שליחת בקשת הביטול');
    }
  }

  /* ===================== Misc ===================== */

  onDateClick(_dateIso: string) {}

  print() {
    window.print();
  }

  canCancel(lesson: Lesson) {
    if (lesson.lesson_type === 'השלמה') return false;
    if (lesson.status === 'הושלם' || lesson.status === 'בוטל') return false;
    return true;
  }

  canView(_lesson: Lesson) {
    return true;
  }

  cancelLesson(_lesson: Lesson) {
    // השארתי פונקציה תקינה תחבירית (אם את משתמשת בה במקום הדיאלוג)
    this.ui.confirm({
      title: 'ביטול שיעור',
      message: `האם לבטל את השיעור?`,
      okText: 'כן, לבטל',
      cancelText: 'ביטול',
      showCancel: true,
    });
  }

  viewDetails(_lesson: Lesson) {
    return;
  }

  openCompletionDialog() {}

  statusClass(status: string): string {
    switch (status) {
      case 'אושר':
        return 'status-approved';
      case 'בוטל':
        return 'status-cancelled';
      case 'הושלם':
        return 'status-done';
      case 'ממתין לאישור':
        return 'status-pending';
      default:
        return '';
    }
  }
}
