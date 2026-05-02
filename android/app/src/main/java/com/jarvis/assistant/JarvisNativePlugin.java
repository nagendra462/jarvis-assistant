package com.jarvis.assistant;

import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import java.util.Locale;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.ExistingPeriodicWorkPolicy;
import java.util.concurrent.TimeUnit;
import android.content.SharedPreferences;

@CapacitorPlugin(name = "JarvisNative")
public class JarvisNativePlugin extends Plugin {

    private BroadcastReceiver commandReceiver;
    private TextToSpeech tts;
    private boolean isTtsInitialized = false;

    @Override
    public void load() {
        super.load();
        commandReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if ("com.jarvis.assistant.COMMAND_DETECTED".equals(intent.getAction())) {
                    String command = intent.getStringExtra("command");
                    JSObject ret = new JSObject();
                    ret.put("command", command);
                    notifyListeners("onCommandDetected", ret);
                }
            }
        };
        // Register receiver for background commands
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(commandReceiver, new IntentFilter("com.jarvis.assistant.COMMAND_DETECTED"), Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(commandReceiver, new IntentFilter("com.jarvis.assistant.COMMAND_DETECTED"));
        }
        
        tts = new TextToSpeech(getContext(), status -> {
            if (status == TextToSpeech.SUCCESS) {
                int result = tts.setLanguage(Locale.UK);
                if (result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED) {
                    isTtsInitialized = true;
                    try {
                        for (Voice v : tts.getVoices()) {
                            if (v.getName().toLowerCase().contains("en-gb") && v.getName().toLowerCase().contains("network") && v.getName().toLowerCase().contains("local") == false) {
                                tts.setVoice(v);
                                break;
                            }
                        }
                    } catch (Exception e) {}
                }
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (commandReceiver != null) {
            getContext().unregisterReceiver(commandReceiver);
        }
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
    }

    @PluginMethod
    public void startBackgroundService(PluginCall call) {
        try {
            Intent serviceIntent = new Intent(getContext(), JarvisBackgroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }
            JSObject ret = new JSObject();
            ret.put("status", "Foreground service started successfully.");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to start background service", e);
        }
    }

    @PluginMethod
    public void getForegroundApp(PluginCall call) {
        String topPackageName = "unknown";
        try {
            UsageStatsManager mUsageStatsManager = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
            long time = System.currentTimeMillis();
            List<UsageStats> stats = mUsageStatsManager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, time - 1000 * 10, time);
            
            if (stats != null && !stats.isEmpty()) {
                SortedMap<Long, UsageStats> mySortedMap = new TreeMap<>();
                for (UsageStats usageStats : stats) {
                    mySortedMap.put(usageStats.getLastTimeUsed(), usageStats);
                }
                if (!mySortedMap.isEmpty()) {
                    topPackageName = mySortedMap.get(mySortedMap.lastKey()).getPackageName();
                }
            }
        } catch (Exception e) {
            topPackageName = "error_fetching_stats";
        }
        
        JSObject ret = new JSObject();
        ret.put("packageName", topPackageName);
        call.resolve(ret);
    }

    @PluginMethod
    public void speakText(PluginCall call) {
        String text = call.getString("text", "");
        Float pitch = call.getFloat("pitch");
        Float rate = call.getFloat("rate");
        Boolean interrupt = call.getBoolean("interrupt", false);
        
        if (!isTtsInitialized || tts == null) {
            call.reject("TTS not initialized yet.");
            return;
        }
        
        if (text == null || text.isEmpty()) {
            call.reject("Must provide text to speak.");
            return;
        }

        tts.setPitch(pitch != null ? pitch : 0.9f);
        tts.setSpeechRate(rate != null ? rate : 0.95f);
        
        int queueMode = (interrupt != null && interrupt) ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD;
        
        tts.speak(text, queueMode, null, "JARVIS_TTS_" + System.currentTimeMillis());
        
        JSObject ret = new JSObject();
        ret.put("status", "Speaking");
        call.resolve(ret);
    }
    
    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        if (isTtsInitialized && tts != null) {
            tts.stop();
        }
        call.resolve();
    }

    @PluginMethod
    public void setApiKey(PluginCall call) {
        String apiKey = call.getString("apiKey");
        if (apiKey != null) {
            SharedPreferences prefs = getContext().getSharedPreferences("JarvisPrefs", Context.MODE_PRIVATE);
            prefs.edit().putString("gemini_api_key", apiKey).apply();
            
            PeriodicWorkRequest heartbeatWork =
                    new PeriodicWorkRequest.Builder(ProactiveWorker.class, 1, TimeUnit.HOURS)
                            .build();
            WorkManager.getInstance(getContext()).enqueueUniquePeriodicWork(
                    "JarvisHeartbeat",
                    ExistingPeriodicWorkPolicy.KEEP,
                    heartbeatWork
            );
            
            call.resolve();
        } else {
            call.reject("API Key missing");
        }
    }
}
