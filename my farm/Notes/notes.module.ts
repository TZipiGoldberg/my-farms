import { NgModule } from '@angular/core';
import { NoteComponent } from './note.component';

@NgModule({
  imports: [NoteComponent],
  exports: [NoteComponent]
})
export class NotesModule {}
