package com.meetbookish.app;

final class CalendarPayload {
    private CalendarPayload() {}
    static boolean isValid(String content) {
        return content != null && content.length() <= 100000
            && content.startsWith("BEGIN:VCALENDAR")
            && content.trim().endsWith("END:VCALENDAR");
    }
}
