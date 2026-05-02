package com.jarvis.assistant;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class JarvisBackgroundService extends Service {
    private static final String TAG = "JarvisBackgroundService";
    private static final String CHANNEL_ID = "JarvisServiceChannel";
    
    private Model model;
    private Recognizer recognizer;
    private AudioRecord audioRecord;
    private Thread audioThread;
    private boolean isListening = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("JARVIS")
                .setContentText("Offline Wake-Word Active")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .build();
        startForeground(1, notification);

        initVoskOfflineEngine();
    }

    private void initVoskOfflineEngine() {
        new Thread(() -> {
            try {
                File modelDir = new File(getFilesDir(), "vosk-model");
                if (!modelDir.exists() || modelDir.listFiles() == null || modelDir.listFiles().length == 0) {
                    Log.d(TAG, "Model not found locally. Downloading lightweight VOSK model...");
                    downloadAndExtractModel(modelDir);
                }

                // The zip contains a root folder, let's find the actual model folder
                File actualModelDir = findModelDir(modelDir);
                if (actualModelDir == null) {
                    Log.e(TAG, "Could not find model directory structure.");
                    return;
                }

                Log.d(TAG, "Loading VOSK model from " + actualModelDir.getAbsolutePath());
                model = new Model(actualModelDir.getAbsolutePath());
                recognizer = new Recognizer(model, 16000.0f);
                
                startAudioRecord();
            } catch (Exception e) {
                Log.e(TAG, "Failed to init VOSK: " + e.getMessage(), e);
            }
        }).start();
    }

    private File findModelDir(File root) {
        if (new File(root, "am").exists() && new File(root, "conf").exists()) {
            return root;
        }
        File[] children = root.listFiles();
        if (children != null) {
            for (File child : children) {
                if (child.isDirectory()) {
                    File found = findModelDir(child);
                    if (found != null) return found;
                }
            }
        }
        return null;
    }

    private void downloadAndExtractModel(File destDir) throws Exception {
        destDir.mkdirs();
        URL url = new URL("https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        InputStream is = conn.getInputStream();
        ZipInputStream zis = new ZipInputStream(new BufferedInputStream(is));
        ZipEntry entry;

        while ((entry = zis.getNextEntry()) != null) {
            File file = new File(destDir, entry.getName());
            if (entry.isDirectory()) {
                file.mkdirs();
            } else {
                file.getParentFile().mkdirs();
                FileOutputStream fos = new FileOutputStream(file);
                byte[] buffer = new byte[4096];
                int count;
                while ((count = zis.read(buffer)) != -1) {
                    fos.write(buffer, 0, count);
                }
                fos.close();
            }
            zis.closeEntry();
        }
        zis.close();
        conn.disconnect();
    }

    private void startAudioRecord() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "Microphone permission denied.");
            return;
        }

        int bufferSize = Math.round(16000 * 0.2f); // 0.2 seconds buffer
        audioRecord = new AudioRecord(MediaRecorder.AudioSource.MIC, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferSize * 2);
        
        if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
            Log.e(TAG, "AudioRecord failed to initialize");
            return;
        }

        audioRecord.startRecording();
        isListening = true;

        audioThread = new Thread(() -> {
            short[] buffer = new short[bufferSize];
            while (isListening) {
                int nread = audioRecord.read(buffer, 0, buffer.length);
                if (nread > 0) {
                    if (recognizer.acceptWaveForm(buffer, nread)) {
                        processResult(recognizer.getResult(), false);
                    } else {
                        processResult(recognizer.getPartialResult(), true);
                    }
                }
            }
        });
        audioThread.start();
        Log.d(TAG, "VOSK continuous listening started successfully. Zero battery drain.");
    }

    private void processResult(String jsonStr, boolean isPartial) {
        try {
            JSONObject obj = new JSONObject(jsonStr);
            String text = obj.optString(isPartial ? "partial" : "text", "").toLowerCase();
            
            if (text.contains("jarvis")) {
                int idx = text.indexOf("jarvis");
                String command = text.substring(idx + "jarvis".length()).trim();
                
                if (!command.isEmpty() && command.length() > 2) {
                    Log.d(TAG, "VOSK Wake word detected with command: " + command);
                    Intent broadcast = new Intent("com.jarvis.assistant.COMMAND_DETECTED");
                    broadcast.putExtra("command", command);
                    sendBroadcast(broadcast);
                    
                    // Reset recognizer so it doesn't immediately double-fire
                    recognizer.reset();
                }
            }
        } catch (Exception e) {}
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isListening = false;
        if (audioRecord != null) {
            try { audioRecord.stop(); audioRecord.release(); } catch (Exception e) {}
        }
        if (recognizer != null) {
            recognizer.close();
        }
        if (model != null) {
            model.close();
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "JARVIS Background Listener",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(serviceChannel);
        }
    }
}
