package de.fletchr.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VideoConverterPlugin.class);
        super.onCreate(savedInstanceState);
        // A tap on a notification that starts the app: the push plugin only reads the intent of an app that is running already.
        if (getIntent() != null && getIntent().hasExtra("google.message_id")) onNewIntent(getIntent());
    }
}
