package com.orchestriq.lifeline;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Receives incoming SMS (only the system can send this broadcast: the manifest requires BROADCAST_SMS).
 * Bank messages are queued encrypted; everything else is ignored and never stored.
 */
public class SmsReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        if (!SmsInbox.isOn(context)) return;
        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null || parts.length == 0) return;
        // Long messages arrive in parts: join them per sender.
        Map<String, StringBuilder> bodies = new LinkedHashMap<String, StringBuilder>();
        long ts = System.currentTimeMillis();
        for (SmsMessage m : parts) {
            if (m == null) continue;
            String from = m.getDisplayOriginatingAddress();
            if (from == null) from = "";
            StringBuilder sb = bodies.get(from);
            if (sb == null) {
                sb = new StringBuilder();
                bodies.put(from, sb);
            }
            sb.append(m.getDisplayMessageBody());
            if (m.getTimestampMillis() > 0) ts = m.getTimestampMillis();
        }
        boolean any = false;
        for (Map.Entry<String, StringBuilder> e : bodies.entrySet()) {
            if (SmsInbox.isMoneySms(e.getKey(), e.getValue().toString())) {
                SmsInbox.enqueue(context, e.getKey(), e.getValue().toString(), ts);
                any = true;
            }
        }
        if (any) MainActivity.notifySms();
    }
}
