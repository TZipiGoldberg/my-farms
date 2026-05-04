import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  OnChanges,
  SimpleChanges,
  ViewEncapsulation,
  AfterViewInit,
  HostListener,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FullCalendarModule, FullCalendarComponent } from '@fullcalendar/angular';
import { CalendarOptions, EventClickArg, DatesSetArg } from '@fullcalendar/core';
import { DateClickArg } from '@fullcalendar/interaction';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import heLocale from '@fullcalendar/core/locales/he';
import resourceTimeGridPlugin from '@fullcalendar/resource-timegrid';

import { ScheduleItem } from '../../models/schedule-item.model';
import type { EventInput } from '@fullcalendar/core';

type ViewName = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';

@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [CommonModule, FormsModule, FullCalendarModule],
  templateUrl: './schedule.html',
  styleUrls: ['./schedule.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ScheduleComponent implements OnChanges, AfterViewInit {
  @ViewChild('calendar') calendarComponent!: FullCalendarComponent;

  @Input() items: ScheduleItem[] = [];
  @Input() initialView: ViewName = 'timeGridDay';
  @Input() rtl = true;
  @Input() locale: any = heLocale;
  @Input() slotMinTime = '07:00:00';
  @Input() slotMaxTime = '21:00:00';
  @Input() allDaySlot = false;
  @Input() resources: any[] = [];
  @Input() showToolbar = true;


  // למעלה, אחרי שאר ה-@Input
@Input() enableAutoAssign = false;
@Output() autoAssignRequested = new EventEmitter<void>();


  @Output() eventClick = new EventEmitter<EventClickArg>();
  @Output() dateClick = new EventEmitter<DateClickArg>();
  @Output() viewRange = new EventEmitter<{
    start: string;
    end: string;
    viewType: string;
  }>();
  @Output() rightClickDay = new EventEmitter<{
    jsEvent: MouseEvent;
    dateStr: string;
  }>(); 


  currentView: ViewName = this.initialView;
  currentDate = '';
  isFullscreen = false;

    private isNarrow600 = window.innerWidth < 600;

  @HostListener('window:resize')
  onResize() {
    const next = window.innerWidth < 600;
    if (next === this.isNarrow600) return;
    this.isNarrow600 = next;

    const api = this.calendarApi;
    if (api) {
      // גורם לכותרות להתרענן
      api.setOption('dayHeaderContent', this.dayHeaderContentFactory());
    }
  }

  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {}

  // שעה נוכחית (לגלילה אוטומטית)
  private nowScroll(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  }

   private isToday(d: Date) {
    const t = new Date();
    return (
      d.getFullYear() === t.getFullYear() &&
      d.getMonth() === t.getMonth() &&
      d.getDate() === t.getDate()
    );
  }

   /** שבועי/יומי עם resources */
  private mapView(view: ViewName): string {
    const hasRes = !!(this.resources && this.resources.length);
    if (!hasRes) return view;

    if (view === 'timeGridDay') return 'resourceTimeGridDay';
    if (view === 'timeGridWeek') return 'resourceTimeGridWeek'; // ✅ מומלץ
    return view;
  }

  private hebDayLetter(date: Date): string {
    // 0=Sunday ... 6=Saturday
    const map = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    return map[date.getDay()] ?? '';
  }

  private lessonTitleNumberOnly(title: string): string {
  const m = String(title ?? '').match(/\d+/);
  return m ? m[0] : (title ?? '');
}


  private dayHeaderContentFactory() {
    return (args: any) => {
      const viewType = args.view?.type as string;

      const isWeek =
        viewType === 'timeGridWeek' || viewType === 'resourceTimeGridWeek';

      if (isWeek && this.isNarrow600) {
        return { html: `<span>${this.hebDayLetter(args.date)}</span>` };
      }

      // ברירת מחדל של FullCalendar (מה שהוא היה מצייר)
      return { html: args.text };
    };
  }


  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin, resourceTimeGridPlugin],
    initialView: 'timeGridDay',
    locale: heLocale,
    direction: 'rtl',
    headerToolbar: false,
    height: 'auto',
    slotMinTime: '07:00:00',
    slotMaxTime: '21:00:00',
    allDaySlot: false,
    displayEventTime: false,
    eventDisplay: 'block', 
    nowIndicator: true,
    scrollTime: '07:00:00',
    slotDuration: '00:30:00',
    events: [],
    resources: [],
    dayHeaderContent: this.dayHeaderContentFactory(),

    // 👇 קליק שמאלי רגיל
    dateClick: (info: DateClickArg) => this.dateClick.emit(info),
    eventClick: (arg: EventClickArg) => this.eventClick.emit(arg),

    // 👇 קליק ימני על יום (בתצוגת חודש / יום / שבוע)
    dayCellDidMount: (info) => {
      const dateStr = info.date.toISOString().slice(0, 10);

      // אם בעתיד תעבירי classNames ליום – להחיל אותם על ה-frame הפנימי
      const classes = info.el.classList;
      const fcFrame = info.el.querySelector('.fc-daygrid-day-frame');
      if (fcFrame && classes.length > 0) {
        classes.forEach((cls) => fcFrame.classList.add(cls));
      }

      info.el.addEventListener('contextmenu', (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();

        this.ngZone.run(() => {
          this.rightClickDay.emit({ jsEvent: ev, dateStr });
        });
      });
    },

    eventContent: (arg) => {
      
  const { event } = arg;
  const status = event.extendedProps['status'] || '';
  const isSummaryDay = !!event.extendedProps['isSummaryDay'];
  const isSummarySlot = !!event.extendedProps['isSummarySlot'];
  const isInstructorHeader = !!event.extendedProps['isInstructorHeader'];
// 🏖 חופשת חווה – טקסט
if (event.extendedProps['isFarmDayOff']) {
  return {
    html: `
      <div class="event-box farm-day-off-text">
        ${event.title}
      </div>
    `,
  };
}

  // סיכומי חודש/שבוע
  if (isSummaryDay || isSummarySlot) {
    return {
      html: `
        <div class="event-box summary">
          <div class="title">${event.title}</div>
        </div>
      `,
    };
  }

  // כותרת מדריך
  if (isInstructorHeader) {
    return {
      html: `
        <div class="event-box instructor-header">
          <div class="instructor-line">${event.title}</div>
        </div>
      `,
    };
  }
  const title = event.title || ''; 
  const meta = event.extendedProps['meta'] || {};

  // כרטיסיית שיעור – ילדים + סוג
const childrenStr =
  event.extendedProps['children'] ||
  event.extendedProps['child_name'] ||
  event.title ||
  '';

const age = meta.age ? `(${meta.age})` : '';


  const children = childrenStr
    .split('|')
    .map((s: string) => s.trim())
    .filter((s: string) => !!s);

const childrenHtml = children
  .map((name: string) => `<span class="child-name">${name} ${age}</span>`)
  .join('<span class="child-sep"></span>');


  const type = event.extendedProps['lesson_type'] || '';
  const chip = type ? `<span class="chip">${type}</span>` : '';
const horse = event.extendedProps['horse_name'] || '';
const arena = event.extendedProps['arena_name'] || '';




  const resourcesHtml =
    horse || arena
      ? `
        <div class="resource-line">
          ${horse ? `<span class="horse-label">עם ${horse}</span>` : ''}
          ${horse && arena ? '<span class="sep">·</span>' : ''}
          ${arena ? `<span class="arena-label">ב${arena}</span>` : ''}
        </div>
      `
      : '';

return {
  html: `
   <div class="event-box">

   

      <div class="children-line">
        ${childrenHtml}
      </div>

      ${resourcesHtml}
      ${chip}
    </div>
  `,
};

},


    // 👇 צביעת אירועים + קליק ימני על אירוע (אותו תפריט כמו על יום)
    eventClassNames: (arg) => {
  const classes: string[] = [];
  const status = arg.event.extendedProps['status'];
  const isSummaryDay = arg.event.extendedProps['isSummaryDay'];
  const isSummarySlot = arg.event.extendedProps['isSummarySlot'];
  const isHeader = arg.event.extendedProps['isInstructorHeader'];

  if (isSummaryDay || isSummarySlot) classes.push('summary-event');
  if (isHeader) classes.push('inst-header');

  const s = (typeof status === 'string' ? status.trim() : '').toUpperCase();

  // כאן תתאימי למחרוזות שהגדרת ב־DB
 if (['בוטל', 'מבוטל', 'CANCELED', 'CANCELLED'].includes(s)) {
  classes.push('status-canceled');
}
 else if (s === 'אושר' || s === 'APPROVED') {
    classes.push('status-approved');
  } else if (
    s === 'ממתין לאישור' ||
    s === 'ממתין לאישור מזכירה' ||
    s === 'PENDING'
  ) {
    classes.push('status-pending');
  }

  return classes;
},


eventDidMount: (info: any) => {
  const meta = info.event.extendedProps?.meta;

  const color = meta?.instructor_color;

  console.log(
    '🎨 instructor_color:',
    color,
    'event:',
    info.event.title
  );

  if (color) {
    const box = info.el.querySelector('.event-box') as HTMLElement | null;
    if (box) {
      box.style.borderRight = `6px solid ${color}`; // RTL
      box.style.boxSizing = 'border-box';
    }
  }



  console.log('🎯 eventDidMount', info.event.title, info.event.extendedProps);

  // ===== TOOLTIP =====

console.log('🧪 META', meta);
  let tooltipText = '';

  // 🏖 חופשת חווה
  if (meta?.isFarmDayOff === true || meta?.isFarmDayOff === 'true') {
    tooltipText = meta.reason
      ? `חופשת חווה:\n${meta.reason}`
      : 'חופשת חווה';
  }

  // 📅 סיכום יום / חודש
  if (meta?.isSummaryDay === true || meta?.isSummaryDay === 'true') {
    tooltipText = info.event.title;
  }

  if (tooltipText) {
    info.el.setAttribute('title', tooltipText);
    info.el.classList.add('has-tooltip');
    console.log('✅ tooltip set:', meta.cancelBlockReason);
  }
    // 🚫 חסימת ביטול – הסבר
  if (meta?.cancelBlockReason) {
    tooltipText = meta.cancelBlockReason;
  }

  // ===================

  // החלת classNames
  (info.event.classNames || []).forEach((cls: string) => {
    info.el.classList.add(cls);
  });

  // קליק ימני על אירוע
  info.el.addEventListener('contextmenu', (ev: MouseEvent) => {
    ev.preventDefault();
    ev.stopPropagation();

    const dateStr = info.event.startStr.slice(0, 10);

    this.ngZone.run(() => {
      this.rightClickDay.emit({ jsEvent: ev, dateStr });
    });
  });
},


 
    datesSet: (info: DatesSetArg) => {
      setTimeout(() => {
        const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
        const toLocalYMD = (d: Date) =>
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        const start = info.start;
        const endExclusive = info.end;
        const endInclusive = new Date(endExclusive);

        const isSingleDay =
          info.view.type === 'timeGridDay' ||
          info.view.type === 'resourceTimeGridDay';

        if (!isSingleDay) {
          endInclusive.setDate(endInclusive.getDate() - 1);
        }

        this.viewRange.emit({
          start: toLocalYMD(start),
          end: toLocalYMD(endInclusive),
          viewType: info.view.type,
        });

        this.currentDate = info.view.title;

        const api = this.calendarApi;
        if (
          api &&
          (info.view.type === 'timeGridDay' ||
            info.view.type === 'resourceTimeGridDay' ||
            info.view.type === 'timeGridWeek' ||
            info.view.type === 'resourceTimeGridWeek')
        ) {
          if (this.isToday(api.getDate())) {
            api.scrollToTime(this.nowScroll());
          }
        }

        this.cdr.detectChanges();
      }, 0);
    },
  };

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.applyCurrentView();
    }, 0);
  }

  ngOnChanges(changes: SimpleChanges) {
  if (changes['resources']) {
    // אחרי שמגיעים resources – לעדכן את ה־View למצב resource*
    setTimeout(() => this.applyCurrentView(), 0);
  }

  if (changes['items'] || changes['resources']) {


    this.calendarOptions = {
      ...this.calendarOptions,
   events: this.items.flatMap<EventInput>((i) => {


  // ===== חופשת חווה =====
if (i.meta?.['isFarmDayOff'] === 'true') {
console.log('🧪 ITEM META', i.meta);

    return [
      // 1️⃣ רקע – צובע את כל היום / שעות
      {
        id: i.id + '_bg',
        start: i.start,
        end: i.end,
        display: 'background',
        backgroundColor: '#FFE0B2',
        overlap: false,
      },

      // 2️⃣ טקסט – הסיבה
      {
        id: i.id,
        title: i.title,
        start: i.start,
        end: i.end,
        color: '#FB8C00',
        textColor: '#4E342E',
        extendedProps: {
          isFarmDayOff: true,
        },
      },
    ];
  }


  // ===== אירוע רגיל =====
return [{
  id: i.id,
  title: i.title,
  start: i.start,
  end: i.end,
  backgroundColor: i.color,
  borderColor: i.color,
  resourceId: i.meta?.instructor_id || undefined,
  extendedProps: {
    lesson_id: i.meta?.['lesson_id'],
    meta: i.meta,
       
instructor_color: i.meta?.['instructor_color'],

    status: i.status,
    child_id: i.meta?.child_id,
    child_name: i.meta?.child_name,
    instructor_id: i.meta?.instructor_id,
    instructor_name: i.meta?.instructor_name,
    lesson_type: i.meta?.['lesson_type'],
    children: i.meta?.['children'],
    occur_date: i.meta?.['occur_date'],
    isSummaryDay: i.meta?.isSummaryDay,
    isSummarySlot: i.meta?.isSummarySlot,
    isInstructorHeader: i.meta?.['isInstructorHeader'],
    horse_name: i.meta?.['horse_name'],
    arena_name: i.meta?.['arena_name'],
    
  },
}];

}),

      resources: this.resources,
    };
  }

  if (changes['initialView'] && changes['initialView'].currentValue) {
    this.currentView = changes['initialView'].currentValue;
    this.applyCurrentView();
  }
}


  get calendarApi() {
    return this.calendarComponent?.getApi();
  }

  private applyCurrentView() {
    const api = this.calendarApi;
    if (!api) return;

    const mapped = this.mapView(this.currentView);
    api.changeView(mapped);

    if (
      (this.currentView === 'timeGridDay' ||
        this.currentView === 'timeGridWeek') &&
      this.isToday(api.getDate())
    ) {
      setTimeout(() => api.scrollToTime(this.nowScroll()), 0);
    }
  }

  // בתוך המחלקה ScheduleComponent
onAutoAssignClick() {
  if (!this.enableAutoAssign) return;
  this.autoAssignRequested.emit();
}


  changeView(view: ViewName) {
    this.currentView = view;
    this.applyCurrentView();
  }

  next() {
    this.calendarApi.next();
  }
  prev() {
    this.calendarApi.prev();
  }

  today() {
    const api = this.calendarApi;
    if (!api) return;
    api.today();
    this.applyCurrentView();
  }

  toggleFullscreen() {
    this.isFullscreen = !this.isFullscreen;

    document.body.style.overflow = this.isFullscreen ? 'hidden' : '';

    const api = this.calendarApi;
    if (api) {
      api.setOption('height', this.isFullscreen ? '100%' : 'auto');
      setTimeout(() => {
        api.updateSize();
        if (this.currentView === 'timeGridDay' || this.currentView === 'timeGridWeek') {
          const d = api.getDate();
          const t = new Date();
          if (
            d.getFullYear() === t.getFullYear() &&
            d.getMonth() === t.getMonth() &&
            d.getDate() === t.getDate()
          ) {
            api.scrollToTime(this.nowScroll());
          }
        }
      }, 0);
    }
  }

  goToDay(dateStr: string) {
    const api = this.calendarApi;
    if (!api) return;

    const mapped = this.mapView('timeGridDay');
    api.changeView(mapped, dateStr);
    this.currentView = 'timeGridDay';

    setTimeout(() => api.scrollToTime(this.nowScroll()), 0);
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.isFullscreen) this.toggleFullscreen();
  }

  
}
