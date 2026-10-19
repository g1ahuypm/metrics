"use client";

import { useEffect } from "react";
import { savePushSubscriptionAction, setMyTimeZoneAction } from "@/lib/actions/inbox";
import { currentSubscription, deviceName } from "@/lib/push-client";

/**
 * Runs once per visit: remembers the person's time zone (reminders arrive in their
 * morning) and re-confirms this device's notification subscription with the server.
 */
export function DeviceSetup({ timeZone }: { timeZone: string | null }) {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz !== timeZone) setMyTimeZoneAction(tz).catch(() => {});
    try {
      if (sessionStorage.getItem("pd_push_checked")) return;
      sessionStorage.setItem("pd_push_checked", "1");
    } catch {
      // private mode: check every visit
    }
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    currentSubscription()
      .then((sub) => sub && savePushSubscriptionAction(sub.toJSON(), deviceName()))
      .catch(() => {});
  }, [timeZone]);
  return null;
}
