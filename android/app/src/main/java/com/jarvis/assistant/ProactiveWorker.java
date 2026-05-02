package com.jarvis.assistant;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class ProactiveWorker extends Worker {

    public ProactiveWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences("JarvisPrefs", Context.MODE_PRIVATE);
        String apiKey = prefs.getString("gemini_api_key", null);

        if (apiKey == null || apiKey.isEmpty()) {
            return Result.success(); // No API key, can't do anything
        }

        try {
            // Ping Gemini API directly
            URL url = new URL("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);

            // Create a simple proactive prompt
            JSONObject request = new JSONObject();
            JSONArray contents = new JSONArray();
            JSONObject parts = new JSONObject();
            JSONArray partsArray = new JSONArray();
            JSONObject textObj = new JSONObject();
            textObj.put("text", "You are JARVIS, a proactive AI assistant. The user is not currently looking at the app. It is currently " + new java.util.Date().toString() + ". Generate a short, 1-sentence proactive message or reminder to send to the user as a push notification to keep them focused or motivated. Keep it very brief.");
            partsArray.put(textObj);
            parts.put("parts", partsArray);
            contents.put(parts);
            request.put("contents", contents);

            OutputStream os = conn.getOutputStream();
            os.write(request.toString().getBytes("UTF-8"));
            os.close();

            int responseCode = conn.getResponseCode();
            if (responseCode == 200) {
                BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                String inputLine;
                StringBuilder response = new StringBuilder();
                while ((inputLine = in.readLine()) != null) {
                    response.append(inputLine);
                }
                in.close();

                JSONObject jsonResponse = new JSONObject(response.toString());
                String message = jsonResponse.getJSONArray("candidates")
                        .getJSONObject(0)
                        .getJSONObject("content")
                        .getJSONArray("parts")
                        .getJSONObject(0)
                        .getString("text");

                sendNotification(context, message);
            }

        } catch (Exception e) {
            Log.e("ProactiveWorker", "Error pinging Gemini", e);
            return Result.retry();
        }

        return Result.success();
    }

    private void sendNotification(Context context, String message) {
        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        String channelId = "jarvis_proactive_channel";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(channelId, "JARVIS Proactive Alerts", NotificationManager.IMPORTANCE_DEFAULT);
            notificationManager.createNotificationChannel(channel);
        }

        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("J.A.R.V.I.S.")
                .setContentText(message)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true);

        notificationManager.notify((int) System.currentTimeMillis(), builder.build());
    }
}
