// cancel-lesson-dialog.component.ts
import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

export interface CancelLessonDialogData {
  lessonId: string;
  childName: string;
  instructorName?: string;
  dateStr: string;
  timeStr: string;
  lessonType?: string | null;
  status?: string | null;
  canCancel: boolean;
    isMakeupAllowed?: boolean;
}

@Component({
  selector: 'app-cancel-lesson-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './cancel-lesson-dialog.component.html',
  styleUrls: ['./cancel-lesson-dialog.component.scss'],
})
export class CancelLessonDialogComponent {
  reasonType: 'sick' | 'personal' | 'other' = 'sick';
  reasonText = '';
  loading = false;
  error: string | null = null;

  constructor(
    private dialogRef: MatDialogRef<CancelLessonDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CancelLessonDialogData
  ) {}

  get canSubmit(): boolean {
    if (!this.data.canCancel) return false;
    if (this.reasonType === 'other') {
      return this.reasonText.trim().length >= 3;
    }
    return true;
  }

  private buildReason(): string {
    let base =
      this.reasonType === 'sick'
        ? 'הילד/ה חולה'
        : this.reasonType === 'personal'
        ? 'סיבה אישית'
        : 'אחר';
    if (this.reasonText.trim()) {
      base += ` – ${this.reasonText.trim()}`;
    }
    return base;
  }

  onConfirm() {
    if (!this.canSubmit) return;
    this.loading = true;
    this.error = null;

    // ❗ הדיאלוג רק מחזיר נתונים להורה – הקריאה ל־Supabase נעשית בקומפוננטת ההורה
    this.dialogRef.close({
      cancelRequested: true,
      lessonId: this.data.lessonId,
      reason: this.buildReason(),
    });
  }

  onClose() {
    this.dialogRef.close();
  }
}
