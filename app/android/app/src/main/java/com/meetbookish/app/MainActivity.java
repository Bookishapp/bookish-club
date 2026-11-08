package com.meetbookish.app;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.ViewGroup;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BookishMessagesPlugin.class);
        super.onCreate(savedInstanceState);
        // Own insets once, in native pixels. CSS safe-area values remain zero on Android.
        // Include IME insets so focused fields and dialog actions stay above the keyboard.
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.rgb(51, 16, 26)));
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getWindow(), bridge.getWebView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
        ViewCompat.setOnApplyWindowInsetsListener(bridge.getWebView(), (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime()
            );
            ViewGroup.MarginLayoutParams margins = (ViewGroup.MarginLayoutParams) view.getLayoutParams();
            margins.setMargins(insets.left, insets.top, insets.right, insets.bottom);
            view.setLayoutParams(margins);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(bridge.getWebView());
    }
}
