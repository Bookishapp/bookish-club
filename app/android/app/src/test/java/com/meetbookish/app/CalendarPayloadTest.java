package com.meetbookish.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class CalendarPayloadTest {
    @Test public void acceptsCalendarText() {
        assertTrue(CalendarPayload.isValid("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n"));
    }
    @Test public void rejectsOtherContentAndOversizedData() {
        assertFalse(CalendarPayload.isValid(null));
        assertFalse(CalendarPayload.isValid("<html>private</html>"));
        assertFalse(CalendarPayload.isValid("BEGIN:VCALENDAR\n" + "x".repeat(100001) + "\nEND:VCALENDAR"));
    }
}
