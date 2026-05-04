export interface ScheduleItem {
  id: string;
  title: string;
  start: string;
  end: string;
  color: string;
  status: 'ממתין לאישור' | 'אושר' | 'בוטל' | 'הושלם';
  meta: {
    lesson_id: string;
    child_id: string;
    child_name: string;
    instructor_id: string;
    instructor_name: string;
    start_datetime: string;
    occur_date: string;
    status: 'ממתין לאישור' | 'אושר' | 'בוטל' | 'הושלם';
    
  };
}
