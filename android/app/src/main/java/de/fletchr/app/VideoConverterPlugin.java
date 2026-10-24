package de.fletchr.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.WindowManager;

import androidx.media3.common.Effect;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.effect.Presentation;
import androidx.media3.effect.SpeedChangeEffect;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.DefaultEncoderFactory;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.Effects;
import androidx.media3.transformer.ExportException;
import androidx.media3.transformer.ExportResult;
import androidx.media3.transformer.ProgressHolder;
import androidx.media3.transformer.Transformer;
import androidx.media3.transformer.VideoEncoderSettings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.collect.ImmutableList;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * Converts a chosen video on the phone before it is uploaded (docs/video-prototype.md): 720p H.264, no audio, no B-frames,
 * every frame kept, on the real timeline (a slow-motion clip runs at its capture rate), a keyframe every few frames.
 * The rules (what size, which bitrate, which speed) are decided by the page (src/lib/video-plan.ts); this reads the
 * file, does what it is told and reports progress. Rejections carry a code: unreadable, busy, cancelled, conversion_failed.
 */
@CapacitorPlugin(name = "VideoConverter")
public class VideoConverterPlugin extends Plugin {
    private static final int THUMBNAIL_SIDE = 320;
    private static final long PROGRESS_INTERVAL_MS = 250;

    private final Handler main = new Handler(Looper.getMainLooper());
    private Transformer transformer;
    private PluginCall running;
    private File runningOutput;

    private static Uri toUri(String value) {
        return value.startsWith("/") ? Uri.fromFile(new File(value)) : Uri.parse(value);
    }

    /** What the file says about itself, and its first frame as a small JPEG (base64), so the page can show the clip at once. */
    @PluginMethod
    public void inspect(PluginCall call) {
        String value = call.getString("uri");
        if (value == null) {
            call.reject("no uri", "unreadable");
            return;
        }
        Uri uri = toUri(value);
        new Thread(() -> {
            try (MediaMetadataRetriever r = new MediaMetadataRetriever()) {
                r.setDataSource(getContext(), uri);
                int width = Integer.parseInt(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
                int height = Integer.parseInt(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
                String rotation = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
                if (rotation != null && (Integer.parseInt(rotation) % 180) != 0) {
                    int swap = width;
                    width = height;
                    height = swap;
                }
                String d = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                double durationMs = d == null ? 0 : Double.parseDouble(d);
                String f = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT);
                int frames = f == null ? 0 : Integer.parseInt(f);
                String c = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE);
                double captureFps = c == null ? 0 : Double.parseDouble(c);

                JSObject result = new JSObject();
                result.put("width", width);
                result.put("height", height);
                result.put("durationMs", durationMs);
                result.put("frames", frames);
                result.put("fileFps", durationMs > 0 ? frames * 1000.0 / durationMs : 0);
                result.put("captureFps", captureFps);
                result.put("thumbnail", firstFrame(r, width, height));
                call.resolve(result);
            } catch (Exception e) {
                call.reject("cannot read the video: " + e, "unreadable");
            }
        }).start();
    }

    private static String firstFrame(MediaMetadataRetriever r, int width, int height) {
        float scale = Math.min(1f, THUMBNAIL_SIDE / (float) Math.max(width, height));
        int w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
        Bitmap frame = Build.VERSION.SDK_INT >= 27
            ? r.getScaledFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, w, h)
            : r.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
        if (frame == null) return null;
        if (frame.getWidth() != w || frame.getHeight() != h) frame = Bitmap.createScaledBitmap(frame, w, h, true);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        frame.compress(Bitmap.CompressFormat.JPEG, 80, bytes);
        return Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
    }

    /**
     * Convert to files/media-queue/{id}.file (the folder of the upload queue). Takes what the plan says: height (of the
     * result as shown), bitrate, speed (1 unless slow motion) and keyframeSeconds. Sends `progress` events with `percent`.
     */
    @PluginMethod
    public void convert(PluginCall call) {
        String value = call.getString("uri");
        String id = call.getString("id");
        Integer height = call.getInt("height");
        Integer bitrate = call.getInt("bitrate");
        Double speed = call.getDouble("speed", 1.0);
        Double keyframeSeconds = call.getDouble("keyframeSeconds");
        if (value == null || id == null || height == null || bitrate == null || keyframeSeconds == null) {
            call.reject("missing options", "conversion_failed");
            return;
        }
        if (running != null) {
            call.reject("another video is being converted", "busy");
            return;
        }
        Context context = getContext();
        File folder = new File(context.getFilesDir(), "media-queue");
        folder.mkdirs();
        File out = new File(folder, id + ".file");
        Uri uri = toUri(value);
        long started = System.currentTimeMillis();
        running = call;
        runningOutput = out;
        keepScreenOn(true);

        main.post(() -> {
            List<Effect> effects = new ArrayList<>();
            effects.add(Presentation.createForHeight(height));
            if (speed != 1.0) effects.add(new SpeedChangeEffect(speed.floatValue()));
            EditedMediaItem item = new EditedMediaItem.Builder(MediaItem.fromUri(uri))
                .setRemoveAudio(true)
                .setEffects(new Effects(ImmutableList.<AudioProcessor>of(), ImmutableList.copyOf(effects)))
                .build();
            VideoEncoderSettings settings = new VideoEncoderSettings.Builder()
                .setiFrameIntervalSeconds(keyframeSeconds.floatValue())
                .setBitrate(bitrate)
                .build();
            transformer = new Transformer.Builder(context)
                .setVideoMimeType(MimeTypes.VIDEO_H264)
                .setEncoderFactory(new DefaultEncoderFactory.Builder(context).setRequestedVideoEncoderSettings(settings).build())
                .addListener(new Transformer.Listener() {
                    @Override
                    public void onCompleted(Composition composition, ExportResult exportResult) {
                        JSObject r = new JSObject();
                        r.put("bytes", out.length());
                        r.put("durationMs", exportResult.durationMs);
                        r.put("frames", exportResult.videoFrameCount);
                        r.put("convertMs", System.currentTimeMillis() - started);
                        finish(call, null, null, r);
                    }

                    @Override
                    public void onError(Composition composition, ExportResult exportResult, ExportException exception) {
                        finish(call, "conversion failed: " + exception.getErrorCodeName(), "conversion_failed", null);
                    }
                })
                .build();
            transformer.start(item, out.getAbsolutePath());
            poll(call);
        });
    }

    private void poll(PluginCall call) {
        if (running != call || transformer == null) return;
        ProgressHolder holder = new ProgressHolder();
        if (transformer.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) {
            JSObject event = new JSObject();
            event.put("percent", holder.progress);
            notifyListeners("progress", event);
        }
        main.postDelayed(() -> poll(call), PROGRESS_INTERVAL_MS);
    }

    /** Stop the conversion that is running, if any; its `convert` call is rejected with the code `cancelled`. */
    @PluginMethod
    public void cancel(PluginCall call) {
        main.post(() -> {
            if (running != null && transformer != null) {
                transformer.cancel();
                finish(running, "cancelled", "cancelled", null);
            }
            call.resolve();
        });
    }

    private void finish(PluginCall call, String message, String code, JSObject result) {
        main.post(() -> {
            if (running != call) return;
            running = null;
            transformer = null;
            keepScreenOn(false);
            if (result != null) {
                call.resolve(result);
            } else {
                if (runningOutput != null) runningOutput.delete(); // nothing half-written stays behind
                call.reject(message, code);
            }
            runningOutput = null;
        });
    }

    private void keepScreenOn(boolean on) {
        getActivity().runOnUiThread(() -> {
            if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }
}
