// src/app/pages/availability-tab/availability-tab.component.ts
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { dbTenant } from '../../services/supabaseClient.service';
import { getAuth } from 'firebase/auth';
import { FarmSettingsService } from '../../services/farm-settings.service';
import { ensureTenantContextReady } from '../../services/legacy-compat';

/* ===================== TYPES ===================== */

type UUID = string;

interface TimeSlot {
  start: string | null;
  end: string | null;
  ridingTypeId: UUID | null;

  editing?: 'start' | 'end' | null;
  editSessionStarted?: boolean;

  isNew?: boolean;
  wasUpdated?: boolean;

  // UI validation
  hasError?: boolean;
  errorMessage?: string | null;
  flashError?: boolean;

  originalStart?: string | null;
  originalEnd?: string | null;

  prevStart?: string | null;
  prevEnd?: string | null;
  prevRidingTypeId?: UUID | null;
}

interface DayAvailability {
  key: string; // sun/mon/...
  label: string; // ראשון/שני/...
  active: boolean;
  slots: TimeSlot[];
}

interface RidingType {
  id: UUID;
  code: string;
  name: string;
  max_participants: number | null;
  active: boolean;
}

interface NotificationPrefs {
  cancelLesson: boolean;
  reminder: boolean;
  monthlyReport: boolean;
}

interface ConfirmData {
  parentsCount: number;
}

interface FarmSettings {
  operating_hours_start?: string | null;
  operating_hours_end?: string | null;
  lesson_duration_minutes?: number | null;
  working_days?: number[] | null;
  farm_id?: UUID | null;
}

/** ✅ DB shape לפי הטבלה אצלך (מהצילום) */
type InstructorWeeklyRow = {
  instructor_id_number: string;
  day_of_week: number; // 0..6 (לפי המיפוי החדש)
  start_time: string; // 'HH:MM:SS'
  end_time: string; // 'HH:MM:SS'
  lesson_ridding_type: UUID | null;
  lesson_type_mode?: string | null;
};

/* ===================== COMPONENT ===================== */

@Component({
  selector: 'app-availability-tab',
  standalone: true,
  templateUrl: './availability-tab.html',
  styleUrls: ['./availability-tab.scss'],
  imports: [CommonModule, FormsModule, MatSlideToggleModule, MatButtonModule, MatIconModule],
})
export class AvailabilityTabComponent implements OnInit {
  public userId: string | null = null;
  public instructorIdNumber: string | null = null;

  public days: DayAvailability[] = [];
  public ridingTypes: RidingType[] = [];

  public allowEdit = true;
  public isDirty = false;
  public lockConfirm = false;

  public farmId: UUID | null = null;
  public farmStart = '08:00';
  public farmEnd = '17:00';
  public lessonDuration = 60;
  public farmWorkingDays: number[] = [];

  public notif: NotificationPrefs = {
    cancelLesson: true,
    reminder: true,
    monthlyReport: false,
  };

  public confirmData: ConfirmData | null = null;

  public toastMessage = '';
  private toastTimeout: any;

  private originalDays: DayAvailability[] = [];

  private readonly DAY_LABELS: Array<{ key: DayAvailability['key']; label: string }> = [
    { key: 'sun', label: 'ראשון' },
    { key: 'mon', label: 'שני' },
    { key: 'tue', label: 'שלישי' },
    { key: 'wed', label: 'רביעי' },
    { key: 'thu', label: 'חמישי' },
    { key: 'fri', label: 'שישי' },
    { key: 'sat', label: 'שבת' },
  ];

  // ✅ מיפוי חדש: 0..6
  private readonly DAY_KEY_TO_NUM: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };

  private readonly NUM_TO_DAY_KEY: Record<number, string> = {
    0: 'sun',
    1: 'mon',
    2: 'tue',
    3: 'wed',
    4: 'thu',
    5: 'fri',
    6: 'sat',
  };

  constructor(
    private cdr: ChangeDetectorRef,
    private farmSettingsService: FarmSettingsService,
  ) {}

  /* ===================== INIT ===================== */

  async ngOnInit() {
    await ensureTenantContextReady();

    await this.loadUserId();
    await this.loadInstructorRecord(); // ✅ בלי availability
    await this.loadFarmSettings();
    await this.loadRidingTypes();

    this.loadDefaultsIfEmpty();
    await this.loadInstructorWeekly(); // ✅ קורא מהטבלה weekly
    this.ensureSlotsHaveDefaults();
  }

  private async loadUserId() {
    const auth = getAuth();
    this.userId = auth.currentUser?.uid ?? null;
  }

  /* ===================== FARM SETTINGS ===================== */

  private async loadFarmSettings() {
    try {
      const settings = (await this.farmSettingsService.loadSettings()) as FarmSettings | null;
      if (!settings) return;

      if (Array.isArray(settings.working_days)) {
        this.farmWorkingDays = this.normalizeWorkingDays(settings.working_days);
      }

      if (settings.farm_id) this.farmId = settings.farm_id;

      if (settings.operating_hours_start) this.farmStart = settings.operating_hours_start.slice(0, 5);
      if (settings.operating_hours_end) this.farmEnd = settings.operating_hours_end.slice(0, 5);

      if (settings.lesson_duration_minutes) this.lessonDuration = settings.lesson_duration_minutes;
    } catch (err) {
      console.error('❌ loadFarmSettings failed', err);
    }
  }

  /** יש מערכות ששומרות working_days כ-1..7 / 0..6 / 1..7 עם 7=Sunday.
   *  כאן אנחנו שומרים כמו שמגיע, ובודקים בכל מקרה בצורה "גמישה". */
  private normalizeWorkingDays(days: number[]): number[] {
    // אם הגיע 0..6 -> לפעמים ממירים 0 ל-7
    const has7 = days.includes(7);
    const has0 = days.includes(0);

    if (has7 && !has0) return days; // 1-7 (אולי 7=ראשון)
    if (has0 && !has7) return days.map(d => (d === 0 ? 7 : d)); // 0-6 -> 1-7 (0 הופך ל-7)
    return days;
  }

  /* ===================== RIDING TYPES ===================== */

  private async loadRidingTypes() {
    const { data, error } = await dbTenant()
      .from('riding_types')
      .select('id, code, name, max_participants, active')
      .eq('active', true)
      .order('name');

    if (error) {
      console.error('❌ loadRidingTypes error', error);
      this.ridingTypes = [];
      return;
    }

    this.ridingTypes = (data || []).slice();

    this.ridingTypes.sort((a, b) => {
      const aIsBreak = a.name.includes('הפסק');
      const bIsBreak = b.name.includes('הפסק');

      if (aIsBreak && !bIsBreak) return 1;
      if (!aIsBreak && bIsBreak) return -1;

      return a.name.localeCompare(b.name, 'he');
    });
  }

  /* ===================== INSTRUCTOR ===================== */

  private async loadInstructorRecord() {
    if (!this.userId) return;

    const { data, error } = await dbTenant()
      .from('instructors')
      .select('id_number, notify, allow_availability_edit')
      .eq('uid', this.userId)
      .maybeSingle();

    if (error) {
      console.error('❌ loadInstructorRecord error', error);
      return;
    }
    if (!data) return;

    this.instructorIdNumber = data.id_number;
    this.allowEdit = data.allow_availability_edit ?? true;

    if (data.notify) {
      this.notif = typeof data.notify === 'string' ? JSON.parse(data.notify) : data.notify;
    }
  }

  /* ===================== DEFAULT DAYS ===================== */

  private loadDefaultsIfEmpty() {
    if (this.days.length) return;

    this.days = this.DAY_LABELS.map(d => ({
      key: d.key,
      label: d.label,
      active: false,
      slots: [],
    }));
  }

  /* ===================== WEEKLY (READ) ===================== */

  private async loadInstructorWeekly() {
    if (!this.instructorIdNumber) return;

    const { data, error } = await dbTenant()
      .from('instructor_weekly_availability')
      .select('instructor_id_number, day_of_week, start_time, end_time, lesson_ridding_type, lesson_type_mode')
      .eq('instructor_id_number', this.instructorIdNumber);

    if (error) {
      console.error('❌ loadInstructorWeekly error', error);
      this.originalDays = JSON.parse(JSON.stringify(this.days));
      return;
    }

    const rows = (data || []) as InstructorWeeklyRow[];

    // reset
    for (const day of this.days) {
      day.active = false;
      day.slots = [];
    }

    for (const r of rows) {
      const key = this.NUM_TO_DAY_KEY[Number(r.day_of_week)];
      if (!key) continue;

      const day = this.days.find(d => d.key === key);
      if (!day) continue;

      day.active = true;
      day.slots.push({
        start: this.trimToHHMM(r.start_time),
        end: this.trimToHHMM(r.end_time),
        ridingTypeId: r.lesson_ridding_type ?? null,
        hasError: false,
        errorMessage: null,
      });
    }

    for (const day of this.days) {
      day.slots.sort(
        (a, b) => this.toMin(this.normalizeTime(a.start)) - this.toMin(this.normalizeTime(b.start)),
      );
    }

    this.originalDays = JSON.parse(JSON.stringify(this.days));
  }

  private trimToHHMM(t: string): string {
    if (!t) return t;
    const m = String(t).match(/^(\d{1,2}:\d{2})/); // '09:00:00' -> '09:00'
    return m ? m[1] : t;
  }

  /* ===================== DAYS / SLOTS UI ===================== */

  private ensureSlotsHaveDefaults() {
    for (const day of this.days) {
      for (const slot of day.slots) {
        slot.ridingTypeId ??= defaultType;

        slot.prevStart ??= slot.start;
        slot.prevEnd ??= slot.end;
        slot.prevRidingTypeId ??= slot.ridingTypeId;

        slot.originalStart ??= slot.start;
        slot.originalEnd ??= slot.end;

        slot.hasError ??= false;
        slot.errorMessage ??= null;
      }
    }
  }

  isFarmWorkingDay(dayKey: string): boolean {
    if (!this.farmWorkingDays?.length) return true;

    const n0 = this.DAY_KEY_TO_NUM[dayKey]; // 0..6
    const n1 = n0 + 1; // 1..7
    const nSundayAs7 = n0 === 0 ? 7 : n0; // 7=Sunday style

    return (
      this.farmWorkingDays.includes(n0) ||
      this.farmWorkingDays.includes(n1) ||
      this.farmWorkingDays.includes(nSundayAs7)
    );
  }

  toggleDay(day: DayAvailability) {
    if (!this.allowEdit) return;

    day.active = !day.active;

    if (day.active && !day.slots.length) {
      day.slots.push({
        start: null,
        end: null,
        ridingTypeId: null,
        isNew: true,
        hasError: false,
        errorMessage: null,
      });
    }

    if (!day.active) day.slots = [];
    this.isDirty = true;
  }

  markDirty() {
    if (!this.allowEdit) return;
    this.isDirty = true;
  }

  onSlotFocus(slot: TimeSlot) {
  if (slot.editSessionStarted) return;

  slot.editSessionStarted = true;

  slot.prevStart = slot.start;
  slot.prevEnd = slot.end;
  slot.prevRidingTypeId = slot.ridingTypeId;
}

  slot.editSessionStarted = true;

  // snapshot לרברט
  slot.prevStart ??= slot.start;
  slot.prevEnd ??= slot.end;
  slot.prevRidingTypeId ??= slot.ridingTypeId;

  slot.originalStart ??= slot.start;
  slot.originalEnd ??= slot.end;

  // נקה שגיאות בעת פוקוס
  slot.hasError = false;
  slot.errorMessage = null;
}

onTimeChange(day: DayAvailability, slot: TimeSlot) {
  if (!this.allowEdit) return;

  this.isDirty = true;

  // ולידציה “שקטה” בזמן שינוי – לא טוסט כל הקלדה
  this.validateSlotSilent(day, slot);
}


  /** בזמן הקלדה — בלי "ריוורט", רק סימון בעיה */
  onTimeTyping(day: DayAvailability, slot: TimeSlot) {
    if (!this.allowEdit) return;
    this.isDirty = true;

    slot.flashError = false;
    slot.hasError = false;
    slot.errorMessage = null;

    // אם אחד חסר — עדיין לא מפילים
    if (!slot.start || !slot.end) return;

    if (!this.isFullTime(slot.start) || !this.isFullTime(slot.end)) return;

    const start = this.toMin(this.normalizeTime(slot.start));
    const end = this.toMin(this.normalizeTime(slot.end));

    if (end <= start) {
      slot.flashError = true;
      slot.hasError = true;
      slot.errorMessage = 'שעת סיום חייבת להיות אחרי שעת התחלה';
      return;
    }

    if (this.hasOverlap(day, slot)) {
      slot.flashError = true;
      slot.hasError = true;
      slot.errorMessage = 'יש חפיפה עם טווח אחר באותו יום';
      return;
    }
  }

  /** blur — כאן עושים ולידציה מלאה + revert */
  onTimeBlur(day: DayAvailability, slot: TimeSlot) {
  if (!this.allowEdit) return;

  // אם לא הושלם – תשאירי שגיאה עדינה
  this.validateSlotSilent(day, slot);

  // רק אם שני הערכים מלאים ותקינים – נבדוק חפיפות וטווחים
  if (!slot.start || !slot.end) return;
  if (!this.isFullTime(slot.start) || !this.isFullTime(slot.end)) return;

  slot.start = this.normalizeTime(slot.start);
  slot.end = this.normalizeTime(slot.end);

  // טווח חווה
  if (this.toMin(slot.start) < this.toMin(this.farmStart)) {
    this.toast(`שעת התחלה לא יכולה להיות לפני ${this.farmStart}`);
    this.revert(slot);
    return;
  }
  if (this.toMin(slot.end) > this.toMin(this.farmEnd)) {
    this.toast(`שעת סיום לא יכולה להיות אחרי ${this.farmEnd}`);
    this.revert(slot);
    return;
  }

  // סדר שעות
  if (this.toMin(slot.end) <= this.toMin(slot.start)) {
    this.toast('שעת סיום חייבת להיות אחרי שעת התחלה');
    this.revert(slot);
    return;
  }

  // חפיפה
  if (this.hasOverlap(day, slot)) {
    this.toast('יש חפיפה עם טווח אחר באותו יום');
    this.revert(slot);
    return;
  }

  // עדכון snapshot מוצלח
  slot.prevStart = slot.start;
  slot.prevEnd = slot.end;
  slot.prevRidingTypeId = slot.ridingTypeId;

    slot.wasUpdated = true;
    this.isDirty = true;
  }
  slot.hasError = false;
  slot.errorMessage = null;
}

  onRidingTypeChange(day: DayAvailability, slot: TimeSlot) {
    if (!this.allowEdit) return;
    slot.prevRidingTypeId = slot.ridingTypeId;
    slot.wasUpdated = true;
    this.isDirty = true;

    // אם כבר יש שעות — בדיקת חפיפה מחדש
    this.onTimeTyping(day, slot);
  }

  addSlot(day: DayAvailability) {
    if (!this.allowEdit) return;

    day.slots.push({
      start: null,
      end: null,
      ridingTypeId: null,
      isNew: true,
      hasError: false,
      errorMessage: null,
    });

    this.isDirty = true;
  }

  private validateSlotSilent(_day: DayAvailability, slot: TimeSlot): void {
  slot.hasError = false;
  slot.errorMessage = null;

  // אם שניהם ריקים – לא מציגים כלום
  if (!slot.start && !slot.end) return;

  // חסר אחד מהם
  if (!slot.start || !slot.end) {
    slot.hasError = true;
    slot.errorMessage = 'יש להשלים שעת התחלה וסיום';
    return;
  }

  // פורמט
  if (!this.isFullTime(slot.start) || !this.isFullTime(slot.end)) {
    slot.hasError = true;
    slot.errorMessage = 'פורמט שעה לא תקין';
    return;
  }

  // סדר שעות בסיסי
  const s = this.toMin(this.normalizeTime(slot.start));
  const e = this.toMin(this.normalizeTime(slot.end));
  if (e <= s) {
    slot.hasError = true;
    slot.errorMessage = 'שעת סיום חייבת להיות אחרי שעת התחלה';
    return;
  }
}


  removeSlot(day: DayAvailability, i: number) {
    if (!this.allowEdit) return;
    day.slots.splice(i, 1);
    this.isDirty = true;
  }

  /* ===================== SAVE FLOW ===================== */

  async saveAvailability() {
    for (const day of this.days) {
      if (!day.active) continue;

      for (const slot of day.slots) {
        if (!this.isFullTime(slot.start) || !this.isFullTime(slot.end)) {
          this.toast('יש טווח עם שעה לא תקינה');
          return;
        }

       if (!slot.start || !slot.end) {
  this.toast('יש טווח עם שעה לא תקינה');
  return;
}
        // אם שניהם ריקים - להתעלם (אבל אם יום פעיל ויש לך שורה ריקה - אפשר גם לחסום, את בחרי)
        if (!slot.start && !slot.end) continue;

        if (!slot.start || !slot.end || !this.isFullTime(slot.start) || !this.isFullTime(slot.end)) {
          this.toast('יש טווח עם שעה לא תקינה');
          return;
        }

        slot.start = this.normalizeTime(slot.start);
        slot.end = this.normalizeTime(slot.end);

const startMin = this.toMin(slot.start);
const endMin   = this.toMin(slot.end);

if (endMin <= startMin) {
  this.toast('שעת סיום חייבת להיות אחרי שעת התחלה');
  return;
}


        if (this.toMin(slot.start) < this.toMin(this.farmStart) || this.toMin(slot.end) > this.toMin(this.farmEnd)) {
        if (
          this.toMin(slot.start) < this.toMin(this.farmStart) ||
          this.toMin(slot.end) > this.toMin(this.farmEnd)
        ) {
          this.toast(`השעות חייבות להיות בין ${this.farmStart} ל־${this.farmEnd}`);
          return;
        }

        if (this.toMin(slot.end) <= this.toMin(slot.start)) {
          this.toast('שעת סיום חייבת להיות אחרי שעת התחלה');
          return;
        }

        if (!slot.ridingTypeId) {
          this.toast('חובה לבחור סוג רכיבה');
          return;
        }
      }

      if (this.dayHasAnyOverlap(day)) {
        this.toast(`יש חפיפה בטווחים ביום ${day.label}`);
        return;
      }
    }

    if (!this.allowEdit) {
      this.toast('הזמינות נעולה לעריכה');
      return;
    }

    if (!this.isDirty) {
      this.toast('אין שינויים לשמירה');
      return;
    }

    const changedRanges = this.getChangedAvailabilityRanges();

    for (const r of changedRanges) {
      const impact = await this.loadParentsImpactCountOnly(r.dayLabel, r.oldStart, r.oldEnd);
      if (impact && impact.parentsCount > 0) {
        this.confirmData = impact;
        return;
      }
    }

    this.lockConfirm = true;
  }

  cancelLockConfirm() {
    this.lockConfirm = false;
  }

  async confirmLockAndSave() {
    this.lockConfirm = false;
    await this.saveAvailabilityDirect(); // ✅ שומר ל-weekly
    await this.lockAvailabilityEdit();
  }

  private async saveAvailabilityDirect() {
    if (!this.instructorIdNumber) return;

    const payload = this.buildWeeklyPayloadForSave();

    // 1) delete old
    const { error: delError } = await dbTenant()
      .from('instructor_weekly_availability')
      .delete()
      .eq('instructor_id_number', this.instructorIdNumber);

    if (delError) {
      console.error('❌ delete instructor_weekly_availability error', delError);
      this.toast('שגיאה בשמירה');
      return;
    }

    // 2) insert new
    if (payload.length) {
      const { error: insError } = await dbTenant().from('instructor_weekly_availability').insert(payload);

      if (insError) {
        console.error('❌ insert instructor_weekly_availability error', insError);
        this.toast('שגיאה בשמירה');
        return;
      }
    }

    // 3) (אופציונלי) סנכרון לטבלה/לוגיקה שהמערכת משתמשת בה
    // אם אין לך את ה-RPC בפרויקט – לא יפיל קומפילציה, רק ידפיס שגיאה בלוג
    const { error: rpcError } = await dbTenant().rpc('sync_instructor_availability', {
      p_instructor_id: this.instructorIdNumber,
      p_days: payload,
    });

    if (rpcError) {
      console.error('❌ sync_instructor_availability failed:', rpcError);
      this.toast(`שגיאה בסנכרון זמינות: ${rpcError.message}`);
      return;
    }

  this.isDirty = false;
  this.toast('✔ הזמינות נשמרה');
  this.originalDays = JSON.parse(JSON.stringify(this.days));
  // ניקוי שגיאות ויזואליות אחרי שמירה מוצלחת
for (const day of this.days) {
  for (const slot of day.slots) {
    slot.hasError = false;
    slot.errorMessage = null;
  }
    this.isDirty = false;
    this.toast('✔ הזמינות נשמרה');
    this.originalDays = JSON.parse(JSON.stringify(this.days));
  }

  private buildWeeklyPayloadForSave(): Array<{
    instructor_id_number: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    lesson_ridding_type: UUID | null;
    lesson_type_mode: string | null;
  }> {
    const out: Array<{
      instructor_id_number: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
      lesson_ridding_type: UUID | null;
      lesson_type_mode: string | null;
    }> = [];

    const instructor_id_number = this.instructorIdNumber!;

    for (const day of this.days) {
      if (!day.active) continue;

      const day_of_week = this.DAY_KEY_TO_NUM[day.key]; // 0..6
      if (!Number.isInteger(day_of_week)) continue;

      for (const s of day.slots) {
        // להתעלם משורה ריקה
        if (!s.start && !s.end) continue;

        if (!s.start || !s.end) continue;
        if (!this.isFullTime(s.start) || !this.isFullTime(s.end)) continue;

        out.push({
          instructor_id_number,
          day_of_week,
          start_time: this.toDbTime(s.start), // 'HH:MM:SS'
          end_time: this.toDbTime(s.end),
          lesson_ridding_type: s.ridingTypeId ?? null,
          lesson_type_mode: null,
        });
      }
    }

    return out;
  }

  private async lockAvailabilityEdit() {
    if (!this.userId) return;

    const { error } = await dbTenant().from('instructors').update({ allow_availability_edit: false }).eq('uid', this.userId);

    if (error) {
      console.error('❌ lockAvailabilityEdit error', error);
      return;
    }

    this.allowEdit = false;
  }

  async approveUpdate() {
    this.confirmData = null;
    this.lockConfirm = true;
  }

  cancelUpdate() {
    this.confirmData = null;
  }

  /* ===================== NOTIFICATIONS ===================== */

  async saveNotifications() {
    if (!this.userId) return;

    const { error } = await dbTenant()
      .from('instructors')
      .update({ notify: JSON.stringify(this.notif) })
      .eq('uid', this.userId);

    if (error) {
      console.error('❌ saveNotifications error', error);
      this.toast('שגיאה בשמירת התראות');
      return;
    }

    this.toast('✔ העדפות התראות נשמרו');
  }

  /* ===================== IMPACT + CHANGES ===================== */

  private async loadParentsImpactCountOnly(
    dayHebrew: string,
    startTime: string,
    endTime: string,
  ): Promise<ConfirmData | null> {
    if (!this.instructorIdNumber) return null;

    const { data, error } = await dbTenant().rpc('get_impacted_parents_by_availability', {
      p_instructor_id: this.instructorIdNumber,
      p_day_of_week: dayHebrew, // נשאר לפי מה שהיה אצלך
      p_start_time: startTime,
      p_end_time: endTime,
    });

    if (error || !data) {
      console.warn('⚠️ impact check skipped – RPC missing/failed', error);
      return null;
    }

    if (typeof data === 'object' && !Array.isArray(data) && (data as any).parents_count != null) {
      return { parentsCount: Number((data as any).parents_count) || 0 };
    }

    if (Array.isArray(data)) {
      const unique = new Set<string>();
      for (const row of data) {
        const key =
          (row?.parent_id ?? row?.parent_uid ?? row?.parent_email ?? row?.parent_name ?? '') + '';
        if (key) unique.add(key);
      }
      const count = unique.size > 0 ? unique.size : data.length;
      return { parentsCount: count };
    }

    return null;
  }

  /** טווחים שהיו במקור ונעלמו עכשיו (לצורך השפעה על הורים) */
  private getChangedAvailabilityRanges(): { dayLabel: string; oldStart: string; oldEnd: string }[] {
    const ranges: { dayLabel: string; oldStart: string; oldEnd: string }[] = [];

    for (const oldDay of this.originalDays) {
      const newDay = this.days.find(d => d.key === oldDay.key);

    // יום שהיה פעיל ונמחק
    if (oldDay.active && (!newDay || !newDay.active)) {
      for (const s of oldDay.slots) {
        if (!s.start || !s.end) continue;

        ranges.push({
          dayLabel: oldDay.label,
          oldStart: s.start,
          oldEnd: s.end,
        });
      }
      continue;
    }
      // יום שהיה פעיל וכעת לא פעיל: כל הטווחים נמחקו
      if (oldDay.active && (!newDay || !newDay.active)) {
        for (const s of oldDay.slots) {
          if (s.start && s.end) ranges.push({ dayLabel: oldDay.label, oldStart: s.start, oldEnd: s.end });
        }
        continue;
      }

      // יום פעיל גם בעבר וגם עכשיו: בדוק אם טווחים נמחקו
      if (!oldDay.active || !newDay || !newDay.active) continue;

      const newSet = new Set(
        newDay.slots
          .filter(s => s.start && s.end && this.isFullTime(s.start) && this.isFullTime(s.end))
          .map(s => `${this.normalizeTime(s.start!)}-${this.normalizeTime(s.end!)}`),
      );

      if (!stillExists) {
        ranges.push({
          dayLabel: oldDay.label,
          oldStart: oldSlot.start,
          oldEnd: oldSlot.end,
        });
      }
    }
  }
      for (const oldSlot of oldDay.slots) {
        if (!oldSlot.start || !oldSlot.end) continue;
        const key = `${this.normalizeTime(oldSlot.start)}-${this.normalizeTime(oldSlot.end)}`;
        if (!newSet.has(key)) {
          ranges.push({ dayLabel: oldDay.label, oldStart: oldSlot.start, oldEnd: oldSlot.end });
        }
      }
    }

    return ranges;
  }

  /* ===================== HELPERS ===================== */

  private normalizeTime(t: string): string {
    if (!this.isFullTime(t)) return t;
    const [hh, mm] = t.split(':');
    const h = Number(hh);
    const m = Number(mm);
    if (Number.isNaN(h) || Number.isNaN(m)) return t;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private isFullTime(t: string): boolean {
    return typeof t === 'string' && /^\d{1,2}:\d{2}$/.test(t);
  }

  private addMinutes(time: string, min: number): string {
    const [h, m] = time.split(':').map(Number);
    const d = new Date(2000, 0, 1, h, m + min);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  private normalizeTime(t: string | null): string {
    if (!t) return '';
    if (!this.isFullTime(t)) return t;

    const [hh, mm] = t.split(':');
    const h = Number(hh);
    const m = Number(mm);

    if (Number.isNaN(h) || Number.isNaN(m)) return t;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** ✅ מקבל גם 8:05 וגם 08:05 */
  private isFullTime(t: string | null): boolean {
    return typeof t === 'string' && /^\d{1,2}:\d{2}$/.test(t);
  }

  private toDbTime(t: string): string {
    const hhmm = this.normalizeTime(t);
    return hhmm ? `${hhmm}:00` : '';
  }

  private toMin(t: string) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  private revert(slot: TimeSlot) {
    const start = slot.prevStart ?? slot.originalStart ?? this.farmStart;
    const end = slot.prevEnd ?? slot.originalEnd ?? this.farmEnd;
    const rt = slot.prevRidingTypeId ?? slot.ridingTypeId ?? null;

    // ✅ חשוב: בטיק הבא כדי ש-ngModel לא ידרוס אותנו אחרי blur
    setTimeout(() => {
      slot.start = start;
      slot.end = end;
      slot.ridingTypeId = rt;
      slot.editSessionStarted = false;
      slot.hasError = false;
      slot.errorMessage = null;
      this.cdr.detectChanges();
    });
  }

  private hasOverlap(day: DayAvailability, target: TimeSlot): boolean {
    if (!target.start || !target.end) return false;
    if (!this.isFullTime(target.start) || !this.isFullTime(target.end)) return false;

    const a1 = this.toMin(this.normalizeTime(target.start));
    const a2 = this.toMin(this.normalizeTime(target.end));

    return day.slots.some(s => {
      if (s === target) return false;
      if (!s.start || !s.end) return false;
      if (!this.isFullTime(s.start) || !this.isFullTime(s.end)) return false;

      const b1 = this.toMin(this.normalizeTime(s.start));
      const b2 = this.toMin(this.normalizeTime(s.end));

      return a1 < b2 && a2 > b1;
    });
  }

  private dayHasAnyOverlap(day: DayAvailability): boolean {
    const slots = day.slots
      .filter((s): s is TimeSlot & { start: string; end: string } => !!s.start && !!s.end)
      .filter(s => this.isFullTime(s.start) && this.isFullTime(s.end))
      .map(s => ({
        start: this.toMin(this.normalizeTime(s.start)),
        end: this.toMin(this.normalizeTime(s.end)),
      }))
      .sort((a, b) => a.start - b.start);

    for (let i = 1; i < slots.length; i++) {
      if (slots[i].start < slots[i - 1].end) return true;
    }
    return false;
  }

  private toast(msg: string) {
    this.toastMessage = msg;
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastMessage = '';
      this.cdr.detectChanges();
    }, 2500);
  }
}
