import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SecretaryScheduleComponent } from './secretary-schedule';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { environment } from '../../../../environments/environment';

describe('SecretarySchedule', () => {
  let component: SecretaryScheduleComponent;
  let fixture: ComponentFixture<SecretaryScheduleComponent>;

  beforeEach(async () => {
  await TestBed.configureTestingModule({
    providers: [
      provideFirebaseApp(() => initializeApp(environment.firebase)),
      provideAuth(() => getAuth()),
    ],
  }).compileComponents();

    fixture = TestBed.createComponent(SecretaryScheduleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
