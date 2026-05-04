// src/app/pages/availability-tab/availability-tab.spec.ts
import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';

import { AvailabilityTabComponent } from './availability-tab';
import { FarmSettingsService } from '../../services/farm-settings.service';

import * as legacyCompat from '../../services/legacy-compat';
import * as supabaseSvc from '../../services/supabaseClient.service';
import * as firebaseAuth from 'firebase/auth';

/* -------------------- Supabase mock helpers -------------------- */

type MaybeSingleResult<T> = { data: T | null; error: any };
type SelectResult<T> = { data: T[] | null; error: any };
type RpcResult<T> = { data: T | null; error: any };

function createSupabaseMock() {
  const state = {
    instructors: {
      // can be overridden per-test
      maybeSingle: <MaybeSingleResult<any>>{ data: null, error: null },
      updateError: null as any,
    },
    ridingTypes: {
      select: <SelectResult<any>>{ data: [], error: null },
    },
    rpc: {
      impactedParents: <RpcResult<any>>{ data: null, error: null },
      syncAvailability: <RpcResult<any>>{ data: null, error: null },
    },
    last: {
      updatePayload: null as any,
      rpcName: '' as string,
      rpcArgs: null as any,
      fromTable: '' as string,
      updateWhere: null as any,
    },
  };

  // chain builders
  const instructorSelectBuilder = {
    select: (_cols: string) => ({
      eq: (_col: string, _val: any) => ({
        maybeSingle: async () => state.instructors.maybeSingle,
      }),
    }),
  };

  const instructorUpdateBuilder = {
    update: (payload: any) => {
      state.last.updatePayload = payload;
      return {
        eq: async (col: string, val: any) => {
          state.last.updateWhere = { col, val };
          return { data: null, error: state.instructors.updateError };
        },
      };
    },
  };

  const ridingTypesBuilder = {
    select: (_cols: string) => ({
      eq: (_col: string, _val: any) => ({
        order: async (_col2: string) => state.ridingTypes.select,
      }),
    }),
  };

  const client = {
    from: (table: string) => {
      state.last.fromTable = table;

      if (table === 'instructors') {
        // We return an object that supports both .select(...) and .update(...)
        return {
          ...instructorSelectBuilder,
          ...instructorUpdateBuilder,
        };
      }

      if (table === 'riding_types') {
        return ridingTypesBuilder;
      }

      // default fallback
      return {
        select: (_: any) => ({
          eq: (_a: any, _b: any) => ({
            maybeSingle: async () => ({ data: null, error: null }),
            order: async () => ({ data: [], error: null }),
          }),
        }),
        update: (_: any) => ({
          eq: async () => ({ data: null, error: null }),
        }),
      };
    },

    rpc: async (fn: string, args: any) => {
      state.last.rpcName = fn;
      state.last.rpcArgs = args;

      if (fn === 'get_impacted_parents_by_availability') {
        return state.rpc.impactedParents;
      }
      if (fn === 'sync_instructor_availability') {
        return state.rpc.syncAvailability;
      }
      return { data: null, error: null };
    },
  };

  return { client, state };
}

/* -------------------- FarmSettings mock -------------------- */

class FarmSettingsServiceMock {
  settings: any = {
    farm_id: 'farm-1',
    operating_hours_start: '08:00:00',
    operating_hours_end: '17:00:00',
    lesson_duration_minutes: 60,
    working_days: [0, 1, 2, 3, 4, 5], // 0-6 example
  };

  async loadSettings() {
    return this.settings;
  }
}

/* -------------------- Tests -------------------- */

describe('AvailabilityTabComponent', () => {
  let fixture: ComponentFixture<AvailabilityTabComponent>;
  let component: AvailabilityTabComponent;

  let supa: ReturnType<typeof createSupabaseMock>;
  let farmSettings: FarmSettingsServiceMock;

  beforeEach(async () => {
    supa = createSupabaseMock();
    farmSettings = new FarmSettingsServiceMock();

    spyOn(legacyCompat, 'ensureTenantContextReady').and.resolveTo();

    spyOn(firebaseAuth, 'getAuth').and.returnValue({
      currentUser: { uid: 'uid-1' },
    } as any);

    spyOn(supabaseSvc, 'dbTenant').and.returnValue(supa.client as any);

    await TestBed.configureTestingModule({
      imports: [AvailabilityTabComponent],
      providers: [{ provide: FarmSettingsService, useValue: farmSettings }],
    }).compileComponents();

    fixture = TestBed.createComponent(AvailabilityTabComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('ngOnInit should load user, instructor, farm settings, riding types, defaults', fakeAsync(() => {
    supa.state.instructors.maybeSingle = {
      data: {
        id_number: 'ins-99',
        availability: null,
        notify: null,
        allow_availability_edit: true,
      },
      error: null,
    };

    supa.state.ridingTypes.select = {
      data: [
        { id: 'rt-1', code: 'A', name: 'אימון', max_participants: null, active: true },
        { id: 'rt-2', code: 'B', name: 'הפסקה', max_participants: null, active: true },
      ],
      error: null,
    };

    // run init
    component.ngOnInit();
    tick(); // flush async microtasks

    expect(legacyCompat.ensureTenantContextReady).toHaveBeenCalled();
    expect(component.userId).toBe('uid-1');
    expect(component.instructorIdNumber).toBe('ins-99');

    // defaults days created
    expect(component.days.length).toBe(7);
    expect(component.days[0].key).toBe('sun');

    // farm settings applied & normalized (0 -> 7)
    expect(component.farmStart).toBe('08:00');
    expect(component.farmEnd).toBe('17:00');
    expect(component.lessonDuration).toBe(60);
    expect(component.farmWorkingDays).toContain(7); // 0 became 7

    // riding types sorted with "הפסק" last
    expect(component.ridingTypes.length).toBe(2);
    expect(component.ridingTypes[component.ridingTypes.length - 1].name).toContain('הפסק');
  }));

  it('toggleDay should add an empty slot when turning active and slots empty', () => {
    component.allowEdit = true;
    component.days = [{ key: 'mon', label: 'שני', active: true, slots: [] } as any];

    component.toggleDay(component.days[0]);

    expect(component.days[0].slots.length).toBe(1);
    expect(component.days[0].slots[0].isNew).toBeTrue();
    expect(component.isDirty).toBeTrue();
  });

  it('toggleDay should clear slots when turning inactive', () => {
    component.allowEdit = true;
    component.days = [
      { key: 'mon', label: 'שני', active: false, slots: [{ start: '09:00', end: '10:00', ridingTypeId: 'rt' }] } as any,
    ];

    component.toggleDay(component.days[0]);

    expect(component.days[0].slots.length).toBe(0);
    expect(component.isDirty).toBeTrue();
  });

  it('onSlotFocus should snapshot prev values once', () => {
    const slot: any = { start: '09:00', end: '10:00', ridingTypeId: 'rt-1' };
    component.onSlotFocus(slot);
    expect(slot.editSessionStarted).toBeTrue();
    expect(slot.prevStart).toBe('09:00');
    expect(slot.prevEnd).toBe('10:00');
    expect(slot.prevRidingTypeId).toBe('rt-1');

    // second time should not override
    slot.start = '11:00';
    component.onSlotFocus(slot);
    expect(slot.prevStart).toBe('09:00');
  });

  it('onTimeChange should do nothing when one side is empty', () => {
    component.allowEdit = true;
    component.farmStart = '08:00';
    component.farmEnd = '17:00';

    const day: any = { key: 'mon', label: 'שני', active: true, slots: [] };
    const slot: any = { start: '09:00', end: null, ridingTypeId: null };

    component.onTimeChange(day, slot);

    // should not set errors when missing one side
    expect(slot.hasError).toBeUndefined();
    expect(component.isDirty).toBeFalse();
  });

  it('onTimeBlur should validate silently and mark dirty', () => {
    component.allowEdit = true;
    component.farmStart = '08:00';
    component.farmEnd = '17:00';

    const day: any = { key: 'mon', label: 'שני', active: true, slots: [] };
    const slot: any = { start: '09:00', end: '08:30', ridingTypeId: 'rt-1' };

    component.onTimeBlur(day, slot);

    expect(slot.hasError).toBeTrue();
    expect(slot.errorMessage).toContain('שעת סיום');
    expect(slot.wasUpdated).toBeTrue();
    expect(component.isDirty).toBeTrue();
  });

  it('validateSlotSilent should require ridingTypeId (when both times present)', () => {
    component.farmStart = '08:00';
    component.farmEnd = '17:00';

    const day: any = { key: 'mon', label: 'שני', active: true, slots: [] };
    const slot: any = { start: '09:00', end: '10:00', ridingTypeId: null };

    // call private via bracket
    (component as any).validateSlotSilent(day, slot);

    expect(slot.hasError).toBeTrue();
    expect(slot.errorMessage).toContain('חובה לבחור');
  });

  it('saveAvailability should toast when there are invalid ranges and stop', fakeAsync(() => {
    component.allowEdit = true;
    component.isDirty = true;
    component.farmStart = '08:00';
    component.farmEnd = '17:00';

    component.days = [
      {
        key: 'mon',
        label: 'שני',
        active: true,
        slots: [{ start: '9:0', end: '10:00', ridingTypeId: 'rt-1' } as any], // invalid format
      } as any,
    ];

    component.saveAvailability();
    tick();

    expect(component.toastMessage).toContain('שעה לא תקינה');
    expect(component.lockConfirm).toBeFalse();
    expect(component.confirmData).toBeNull();
  }));

  it('saveAvailability should open confirmData when impacted parents > 0', fakeAsync(() => {
    component.allowEdit = true;
    component.isDirty = true;
    component.userId = 'uid-1';
    component.instructorIdNumber = 'ins-1';
    component.farmStart = '08:00';
    component.farmEnd = '17:00';

    // original had a slot, new removed => change detected => impact check runs
    (component as any).originalDays = [
      { key: 'mon', label: 'שני', active: true, slots: [{ start: '09:00', end: '10:00', ridingTypeId: 'rt-1' }] },
    ];
    component.days = [{ key: 'mon', label: 'שני', active: false, slots: [] } as any];

    supa.state.rpc.impactedParents = { data: { parents_count: 3 }, error: null };

    component.saveAvailability();
    tick();

    expect(component.confirmData).toEqual({ parentsCount: 3 });
    expect(component.lockConfirm).toBeFalse();
  }));

  it('approveUpdate should close confirmData and set lockConfirm', () => {
    component.confirmData = { parentsCount: 2 };
    component.lockConfirm = false;

    component.approveUpdate();

    expect(component.confirmData).toBeNull();
    expect(component.lockConfirm).toBeTrue();
  });

  it('saveAvailability should set lockConfirm=true when valid and no impact', fakeAsync(() => {
    component.allowEdit = true;
    component.isDirty = true;
    component.userId = 'uid-1';
    component.instructorIdNumber = 'ins-1';
    component.farmStart = '08:00';
    component.farmEnd = '17:00';

    (component as any).originalDays = []; // no changed ranges => no impact checks

    component.days = [
      {
        key: 'mon',
        label: 'שני',
        active: true,
        slots: [{ start: '09:00', end: '10:00', ridingTypeId: 'rt-1' } as any],
      } as any,
    ];

    component.saveAvailability();
    tick();

    expect(component.lockConfirm).toBeTrue();
    expect(component.confirmData).toBeNull();
  }));

  it('confirmLockAndSave should call save direct then lock edit', fakeAsync(() => {
    component.userId = 'uid-1';
    component.instructorIdNumber = 'ins-1';
    component.allowEdit = true;
    component.isDirty = true;

    const saveDirectSpy = spyOn<any>(component as any, 'saveAvailabilityDirect').and.resolveTo();
    const lockSpy = spyOn<any>(component as any, 'lockAvailabilityEdit').and.resolveTo();

    component.lockConfirm = true;
    component.confirmLockAndSave();
    tick();

    expect(component.lockConfirm).toBeFalse();
    expect(saveDirectSpy).toHaveBeenCalled();
    expect(lockSpy).toHaveBeenCalled();
  }));

  it('saveAvailabilityDirect should update instructor + call sync rpc and then mark clean', fakeAsync(() => {
    component.userId = 'uid-1';
    component.instructorIdNumber = 'ins-1';
    component.allowEdit = true;
    component.isDirty = true;

    component.days = [
      {
        key: 'mon',
        label: 'שני',
        active: true,
        slots: [{ start: '09:00', end: '10:00', ridingTypeId: 'rt-1', hasError: true, errorMessage: 'x' } as any],
      } as any,
    ];

    supa.state.rpc.syncAvailability = { data: null, error: null };

    (component as any).saveAvailabilityDirect();
    tick();

    // instructors.update should have been called with allow_availability_edit:false
    expect(supa.state.last.updatePayload.allow_availability_edit).toBeFalse();

    // rpc should be sync_instructor_availability
    expect(supa.state.last.rpcName).toBe('sync_instructor_availability');
    expect(supa.state.last.rpcArgs.p_instructor_id).toBe('ins-1');
    expect(Array.isArray(supa.state.last.rpcArgs.p_days)).toBeTrue();
    expect(supa.state.last.rpcArgs.p_days[0]).toEqual(
      jasmine.objectContaining({
        day_of_week: 2, // mon => 2
        start_time: '09:00',
        end_time: '10:00',
        riding_type_id: 'rt-1',
      })
    );

    expect(component.isDirty).toBeFalse();
    expect(component.toastMessage).toContain('נשמרה');
    expect(component.days[0].slots[0].hasError).toBeFalse();
    expect(component.days[0].slots[0].errorMessage).toBeNull();
  }));

  it('saveAvailabilityDirect should toast error if sync rpc fails', fakeAsync(() => {
    component.userId = 'uid-1';
    component.instructorIdNumber = 'ins-1';
    component.isDirty = true;

    component.days = [
      {
        key: 'mon',
        label: 'שני',
        active: true,
        slots: [{ start: '09:00', end: '10:00', ridingTypeId: 'rt-1' } as any],
      } as any,
    ];

    supa.state.rpc.syncAvailability = { data: null, error: { message: 'boom' } };

    (component as any).saveAvailabilityDirect();
    tick();

    expect(component.toastMessage).toContain('שגיאה בסנכרון זמינות');
    expect(component.isDirty).toBeTrue(); // not cleared
  }));

  it('toast should clear after 2500ms', fakeAsync(() => {
    // call private via bracket
    (component as any).toast('hello');
    expect(component.toastMessage).toBe('hello');

    tick(2499);
    expect(component.toastMessage).toBe('hello');

    tick(1);
    expect(component.toastMessage).toBe('');
  }));

  it('isFarmWorkingDay should allow all when no farmWorkingDays', () => {
    component.farmWorkingDays = [];
    expect(component.isFarmWorkingDay('sun')).toBeTrue();
    expect(component.isFarmWorkingDay('sat')).toBeTrue();
  });

  it('isFarmWorkingDay should map keys and check includes', () => {
    component.farmWorkingDays = [1, 2, 3, 4, 5, 6]; // no שבת
    expect(component.isFarmWorkingDay('sun')).toBeTrue();
    expect(component.isFarmWorkingDay('sat')).toBeFalse();
  });
});
