import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InstructorScheduleComponent } from './instructor-schedule';
import { ChangeDetectorRef } from '@angular/core';
import { CurrentUserService } from '../../../core/auth/current-user.service';

/* ---------- MOCKS ---------- */

class MockCurrentUserService {
  async loadUserDetails() {
    return {
      uid: 'u1',
      id_number: '123456',
    };
  }
}

describe('InstructorScheduleComponent', () => {
  let component: InstructorScheduleComponent;
  let fixture: ComponentFixture<InstructorScheduleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InstructorScheduleComponent],
      providers: [
        { provide: CurrentUserService, useClass: MockCurrentUserService },
        ChangeDetectorRef,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InstructorScheduleComponent);
    component = fixture.componentInstance;

    // ❌ חשוב: לא להריץ ngOnInit אמיתי
    spyOn(component, 'ngOnInit').and.stub();
  });

  afterEach(() => {
    // מונע cleanup errors
    fixture.destroy();
  });

  /* ---------- BASIC ---------- */

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  /* ---------- FILE SELECT ---------- */

  it('should set selected sick file on file select', () => {
    const file = new File(['test'], 'sick.png', { type: 'image/png' });

    const event = {
      target: {
        files: [file],
      },
    } as any;

    component.onSickFileSelected(event);

    expect(component.selectedSickFile).toBe(file);
    expect((component as any).pendingSickFile).toBe(file);
  });

  /* ---------- LABEL MAPPING ---------- */

  it('should map request type to label correctly', () => {
    expect(component.getRequestLabel('holiday')).toBe('יום חופש');
    expect(component.getRequestLabel('sick')).toBe('יום מחלה');
    expect(component.getRequestLabel('personal')).toBe('יום אישי');
    expect(component.getRequestLabel('other')).toBe('בקשה אחרת');
  });

  /* ---------- NOTE CLOSE ---------- */

  it('should clear selected note on close', () => {
    component.selectedChild = {} as any;
    component.selectedOccurrence = {} as any;
    component.attendanceStatus = 'present';

    component.onCloseNote();

    expect(component.selectedChild).toBeNull();
    expect(component.selectedOccurrence).toBeNull();
    expect(component.attendanceStatus).toBeNull();
  });
});
