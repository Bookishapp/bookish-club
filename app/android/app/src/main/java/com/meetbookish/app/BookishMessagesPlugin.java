package com.meetbookish.app;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "BookishMessages")
public class BookishMessagesPlugin extends Plugin {
    @PluginMethod
    public void saveCalendar(PluginCall call) {
        String content = call.getString("content");
        if (!CalendarPayload.isValid(content)) {
            call.reject("The calendar file is invalid.");
            return;
        }
        try {
            File directory = new File(getContext().getCacheDir(), "bookish-calendar");
            if (!directory.exists() && !directory.mkdirs()) throw new java.io.IOException();
            File calendar = new File(directory, "bookish-meeting.ics");
            try (FileOutputStream output = new FileOutputStream(calendar)) {
                output.write(content.getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", calendar);
            Intent intent = new Intent(Intent.ACTION_SEND).setType("text/calendar")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.setClipData(ClipData.newRawUri("Bookish meeting", uri));
            getActivity().startActivity(Intent.createChooser(intent, "Save meeting to calendar"));
            call.resolve();
        } catch (Exception error) {
            call.reject("We could not open the calendar share sheet.");
        }
    }
}
