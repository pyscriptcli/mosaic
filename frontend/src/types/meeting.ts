export interface DiscussionItem {
  id: string | number;
  topic: string;
  category?: "decision" | "action" | "risk" | "open_question" | "insight" | "context";
  importance?: "material" | "supporting";
  why_it_matters?: string;
  evidence: string;
  discussion_point: string;
  /** Legacy read compatibility for older archive consumers. New edits store these on action_items. */
  action_plan?: string;
  target_date?: string;
  person_in_charge?: string;
  action_suggestion?: {
    action_plan?: string;
    target_date?: string;
    person_in_charge?: string;
  };
}

export interface MeetingActionItem {
  id: string | number;
  discussion_point_id: string | number;
  action_plan: string;
  target_date: string;
  person_in_charge: string;
  assignee_ids?: string[];
  /** Legacy single-assignee read/write compatibility. */
  assignee_id?: string;
  clickUpTaskId?: string;
  clickUpUrl?: string;
}

export interface MeetingDetails {
  client_name: string;
  date: string;
  start_time?: string;
  end_time?: string;
  meeting_type: "Internal" | "External" | "Team" | string;
  location: string;
  attendees_prime?: string[];
  attendees_external?: string[];
  duration_minutes?: number;
  duration_seconds?: number;
}

export interface ArchivedMeeting {
  id: string;
  meeting_id: string;
  title: string;
  date: string;
  start_time?: string;
  end_time?: string;
  meeting_type: "Internal" | "External" | "Team";
  location: string;
  attendees_prime: string[];
  attendees_external: string[];
  summary: string;
  items: DiscussionItem[];
  action_items?: MeetingActionItem[];
  transcript?: string;
  meeting_notes?: string;
  recording_type?: "audio" | "video";
  recording_format?: string;
  recording_url?: string;
  created_at?: string;
  clickup_space_id?: string;
  clickup_space_name?: string;
  clickup_list_id?: string;
  clickup_list_name?: string;
  clickup_task_url?: string;
  archive_status?: string;
  is_confidential?: boolean;
  duration_seconds?: number;
  duration_minutes?: number;
}
