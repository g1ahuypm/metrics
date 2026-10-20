"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellOff, BellRing, Loader2, Share, Smartphone } from "lucide-react";
import { FormMessage } from "@/components/FormMessage";
import { removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from "@/lib/actions/inbox";
import type { FormState } from "@/lib/actions/auth";
import { currentSubscription, deviceName, isIos, pushSupport, subscribeDevice } from "@/lib/push-client";

type Status = "checking" | "on" | "off" | "blocked" | "ios-needs-home-screen" | "unsupported";

/** Turns phone/browser notifications on or off for the device you're using. */
export function NotificationsCard({ publicKey, devices }: { publicKey: string; devices: string[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState<FormState>(undefined);
  const [pending, start] = useTransition();

  useEffect(() => {
    const support = pushSupport();
    if (support !== "ok") return setStatus(support);
    if (Notification.permission === "denied") return setStatus("blocked");
    currentSubscription()
      .then((sub) => setStatus(sub && Notification.permission === "granted" ? "on" : "off"))
      .catch(() => setStatus("off"));
  }, []);

  const turnOn = () =>
    start(async () => {
      setMessage(undefined);
      try {
        const sub = await subscribeDevice(publicKey);
        const res = await savePushSubscriptionAction(sub.toJSON(), deviceName());
        if (res?.error) return setMessage(res);
        setStatus("on");
        setMessage(await sendTestPushAction());
        router.refresh();
      } catch (err) {
        const reason = err instanceof Error ? err.message : "";
        const name = err instanceof Error ? err.name : "";
        if (reason === "blocked") setStatus("blocked");
        else if (reason === "dismissed") setMessage({ error: "You closed the question without allowing. Tap the button again and choose Allow." });
        else if (name === "NotAllowedError")
          setMessage({ error: "This browser refused to turn on notifications. Private or incognito windows can't get them; open the dashboard in a normal window, or in Chrome or Safari." });
        else if (name === "AbortError")
          setMessage({ error: "Couldn't reach the browser's notification service. Check the internet connection and try again." });
        else setMessage({ error: `Couldn't turn on notifications: ${reason || "unknown error"}` });
      }
    });

  const turnOff = () =>
    start(async () => {
      setMessage(undefined);
      const sub = await currentSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe().catch(() => {});
      }
      setStatus("off");
      router.refresh();
    });

  const test = () =>
    start(async () => {
      setMessage(await sendTestPushAction());
    });

  const elsewhere = devices.length > 0 ? `On for: ${devices.join(", ")}.` : "Not turned on for any device yet.";

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${status === "on" ? "bg-good/15 text-good-text" : "bg-accent-soft text-accent"}`}>
          {status === "on" ? <BellRing className="h-4 w-4" /> : status === "ios-needs-home-screen" ? <Smartphone className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">
            {status === "on" ? "Notifications are on for this device" : "Phone & browser notifications"}
          </h2>

          {status === "checking" && <p className="mt-1 text-sm text-ink-3">Checking this device…</p>}

          {status === "off" && (
            <>
              <p className="mt-1 text-sm text-ink-2">
                Get a pop-up on this {isIos() || /Android/.test(navigator.userAgent) ? "phone" : "computer"} when you get a task, a reminder or an answer, even when the dashboard is closed.
              </p>
              <button type="button" className="btn-primary mt-3" onClick={turnOn} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Turn on notifications
              </button>
            </>
          )}

          {status === "on" && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={test} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} Send a test
              </button>
              <button type="button" className="btn-ghost" onClick={turnOff} disabled={pending}>Turn off on this device</button>
            </div>
          )}

          {status === "blocked" && (
            <p className="mt-1 text-sm text-ink-2">
              Notifications are blocked for this site. Click the icon left of the web address (a lock or sliders), set Notifications to <strong className="font-medium">Allow</strong>, then reload this page.
              On a phone: open the browser&apos;s settings → Site settings → Notifications, and allow this site.
            </p>
          )}

          {status === "ios-needs-home-screen" && (
            <div className="mt-1 text-sm text-ink-2">
              <p>On iPhone, notifications only work when the dashboard is added to your home screen (once, 30 seconds):</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>
                  In Safari, tap the Share button <Share className="inline h-3.5 w-3.5 align-[-2px]" /> at the bottom.
                </li>
                <li>Scroll down, tap <strong className="font-medium">Add to Home Screen</strong>, then <strong className="font-medium">Add</strong>.</li>
                <li>Open <strong className="font-medium">Margin</strong> from your home screen and sign in.</li>
                <li>Open Inbox (the bell) and tap <strong className="font-medium">Turn on notifications</strong>, then Allow.</li>
              </ol>
              <p className="mt-2 text-xs text-ink-3">Needs iOS 16.4 or newer (Settings → General → About → iOS Version).</p>
            </div>
          )}

          {status === "unsupported" && (
            <p className="mt-1 text-sm text-ink-2">This browser can&apos;t show notifications. Use Chrome, Edge, Firefox or Safari, or turn them on from your phone.</p>
          )}

          {message && <div className="mt-3"><FormMessage state={message} /></div>}
          {status !== "checking" && <p className="mt-3 text-xs text-ink-3">{elsewhere} Turn them on separately on each phone or computer you use.</p>}
        </div>
      </div>
    </div>
  );
}
