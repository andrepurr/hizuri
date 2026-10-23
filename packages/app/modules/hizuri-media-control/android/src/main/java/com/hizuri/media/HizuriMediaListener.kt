package com.hizuri.media

import android.service.notification.NotificationListenerService

// Empty on purpose: Android lists other apps' media sessions only to an app whose notification
// listener the user enabled. hizuri reads no notifications.
class HizuriMediaListener : NotificationListenerService()
