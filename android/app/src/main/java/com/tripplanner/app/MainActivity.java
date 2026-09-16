package com.tripplanner.app;

import android.app.PictureInPictureParams;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PipPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @CapacitorPlugin(name = "PipPlugin")
    public static class PipPlugin extends Plugin {
        @PluginMethod
        public void enterPip(PluginCall call) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
                    // Aspect ratio for floating driving widget (approx 9:16 portrait or 1:1)
                    Rational ratio = new Rational(9, 16);
                    builder.setAspectRatio(ratio);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        builder.setAutoEnterEnabled(true);
                    }
                    getActivity().enterPictureInPictureMode(builder.build());
                    call.resolve();
                } catch (Exception e) {
                    call.reject("Failed to enter PiP: " + e.getMessage());
                }
            } else {
                call.reject("Picture-in-Picture requires Android 8.0 or higher");
            }
        }

        @PluginMethod
        public void isPipSupported(PluginCall call) {
            JSObject ret = new JSObject();
            boolean supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                getActivity().getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
            ret.put("supported", supported);
            call.resolve(ret);
        }
    }
}

