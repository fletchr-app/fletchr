package de.fletchr.app;

import android.content.Context;
import android.content.Intent;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import androidx.activity.result.ActivityResult;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.Effect;
import androidx.media3.effect.Presentation;
import androidx.media3.effect.SpeedChangeEffect;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.DefaultEncoderFactory;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.Effects;
import androidx.media3.transformer.ExportException;
import androidx.media3.transformer.ExportResult;
import androidx.media3.transformer.Transformer;
import androidx.media3.transformer.VideoEncoderSettings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import com.google.common.collect.ImmutableList;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Prototype for #70: pick a video and convert it on the phone (720p H.264, no audio, real timeline, short keyframe interval).
 * Throwaway: the result decides how the real media plugin is built.
 */
@CapacitorPlugin(name = "VideoConverter")
public class VideoConverterPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void pickAndConvert(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("video/*");
        startActivityForResult(call, intent, "picked");
    }

    /** Convert the clip picked last time again, with other settings (the picked file is kept in the cache). */
    @PluginMethod
    public void convertAgain(PluginCall call) {
        File source = new File(getContext().getCacheDir(), "source.mp4");
        if (!source.exists()) {
            call.reject("pick a clip first");
            return;
        }
        convert(call, Uri.fromFile(source));
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (data == null || data.getData() == null) {
            call.reject("nothing chosen");
            return;
        }
        // Keep a copy, so the same clip can be converted again with other settings without picking it again.
        File source = new File(getContext().getCacheDir(), "source.mp4");
        try (InputStream in = getContext().getContentResolver().openInputStream(data.getData()); OutputStream out = new FileOutputStream(source)) {
            byte[] buffer = new byte[1 << 16];
            for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
        } catch (Exception e) {
            call.reject("cannot copy the video: " + e);
            return;
        }
        convert(call, Uri.fromFile(source));
    }

    private void convert(PluginCall call, Uri uri) {
        Context context = getContext();
        int height = call.getInt("height", 720);
        int keyframeFrames = call.getInt("keyframeFrames", 10);
        boolean realTimeline = call.getBoolean("realTimeline", true);
        Integer bitrate = call.getInt("bitrate", 6_000_000);

        // What the file says about itself: the capture rate of a slow-motion clip, the frame count and the duration.
        double captureFps = 0, fileFps = 0, durationS = 0;
        int frames = 0, width = 0, srcHeight = 0;
        String hasLocation = null;
        try (MediaMetadataRetriever r = new MediaMetadataRetriever()) {
            r.setDataSource(context, uri);
            String c = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE);
            captureFps = c == null ? 0 : Double.parseDouble(c);
            String f = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_FRAME_COUNT);
            frames = f == null ? 0 : Integer.parseInt(f);
            String d = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            durationS = d == null ? 0 : Double.parseDouble(d) / 1000.0;
            width = Integer.parseInt(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
            srcHeight = Integer.parseInt(r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
            hasLocation = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_LOCATION);
            fileFps = durationS > 0 ? frames / durationS : 0;
        } catch (Exception e) {
            call.reject("cannot read the video: " + e);
            return;
        }
        // A slow-motion clip is stored on a stretched timeline: 120 fps captured, played as about 30 fps.
        double speed = (realTimeline && captureFps > 0 && fileFps > 0 && captureFps > fileFps * 1.5) ? captureFps / fileFps : 1.0;
        double outFps = fileFps * speed;
        // The encoder counts frames from the frame rate it was told; ask for a keyframe interval of keyframeFrames frames of that.
        // (The encoder is told the frame rate of the source file, about 30 fps for slow motion, so the interval is counted with that.)
        Double override = call.getDouble("iFrameSeconds");
        float iFrameSeconds = override != null ? override.floatValue() : (float) (keyframeFrames / (fileFps > 0 ? fileFps : 30.0));

        File out = new File(context.getCacheDir(), "converted-" + System.currentTimeMillis() + ".mp4");
        final double fCapture = captureFps, fFileFps = fileFps, fSpeed = speed, fOutFps = outFps, fDuration = durationS;
        final int fFrames = frames, fWidth = width, fSrcHeight = srcHeight;
        final String fLocation = hasLocation;
        final long t0 = System.currentTimeMillis();

        main.post(() -> {
            List<Effect> videoEffects = new ArrayList<>();
            videoEffects.add(Presentation.createForHeight(height));
            if (fSpeed != 1.0) videoEffects.add(new SpeedChangeEffect((float) fSpeed));
            EditedMediaItem item = new EditedMediaItem.Builder(MediaItem.fromUri(uri))
                .setRemoveAudio(true)
                .setEffects(new Effects(ImmutableList.<AudioProcessor>of(), ImmutableList.copyOf(videoEffects)))
                .build();
            VideoEncoderSettings settings = new VideoEncoderSettings.Builder()
                .setiFrameIntervalSeconds(iFrameSeconds)
                .setBitrate(bitrate)
                .build();
            Transformer transformer = new Transformer.Builder(context)
                .setVideoMimeType(MimeTypes.VIDEO_H264)
                .setEncoderFactory(new DefaultEncoderFactory.Builder(context).setRequestedVideoEncoderSettings(settings).build())
                .addListener(new Transformer.Listener() {
                    @Override
                    public void onCompleted(Composition composition, ExportResult exportResult) {
                        JSObject r = new JSObject();
                        r.put("path", out.getAbsolutePath());
                        r.put("bytes", out.length());
                        r.put("convertMs", System.currentTimeMillis() - t0);
                        r.put("captureFps", fCapture);
                        r.put("fileFps", fFileFps);
                        r.put("speed", fSpeed);
                        r.put("outFps", fOutFps);
                        r.put("srcFrames", fFrames);
                        r.put("srcDurationS", fDuration);
                        r.put("srcWidth", fWidth);
                        r.put("srcHeight", fSrcHeight);
                        r.put("srcLocationTag", fLocation);
                        r.put("iFrameSeconds", iFrameSeconds);
                        r.put("exportVideoFrames", exportResult.videoFrameCount);
                        r.put("exportDurationMs", exportResult.durationMs);
                        call.resolve(r);
                    }

                    @Override
                    public void onError(Composition composition, ExportResult exportResult, ExportException exportException) {
                        call.reject("conversion failed: " + exportException.getErrorCodeName() + " " + exportException.getMessage());
                    }
                })
                .build();
            transformer.start(item, out.getAbsolutePath());
        });
    }
}
