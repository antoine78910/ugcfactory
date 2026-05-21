"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Send, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  APPLICATION_SOURCE_OPTIONS,
  DAILY_OUTPUT_OPTIONS,
  EDITING_SOFTWARE_OPTIONS,
  ENGLISH_FLUENCY_LABELS,
  EXAMPLE_TIKTOK_ACCOUNTS,
  REFERENCE_EDIT_QUALITY_DRIVE_URL,
  SMART_SHORT_FORM_VIDEO_EDITOR_JOB_SLUG,
} from "@/lib/careers/videoEditorApplication";
import { careersFormFieldClass, careersTheme } from "./careersTheme";
import {
  careersSessionMarkOnce,
  getCareersVisitorId,
  trackCareersEvent,
} from "@/lib/careers/trackClient";

type Props = {
  jobSlug?: string;
};

export function SmartShortFormVideoEditorApplicationForm({
  jobSlug = SMART_SHORT_FORM_VIDEO_EDITOR_JOB_SLUG,
}: Props) {
  const startedRef = useRef(false);
  const [privacy, setPrivacy] = useState(false);
  const [englishFluency, setEnglishFluency] = useState("");
  const [dailyOutput, setDailyOutput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const markStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (careersSessionMarkOnce(`application_started_${jobSlug}`)) {
      void trackCareersEvent("application_started", jobSlug);
    }
  }, [jobSlug]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!privacy) {
      setError("Please confirm the privacy notice.");
      return;
    }
    if (!englishFluency) {
      setError("Please rate your English fluency (1–5).");
      return;
    }
    if (!dailyOutput) {
      setError("Please answer about daily short-form output.");
      return;
    }

    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("visitor_id", getCareersVisitorId());
    fd.set("job_slug", jobSlug);
    fd.set("privacy_accepted", privacy ? "true" : "false");
    fd.set("english_fluency", englishFluency);
    fd.set("daily_output_capacity", dailyOutput);

    setSubmitting(true);
    try {
      const r = await fetch("/api/careers/apply", {
        method: "POST",
        body: fd,
      });
      const data = (await r.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };
      if (!r.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSuccess(true);
      form.reset();
      setPrivacy(false);
      setEnglishFluency("");
      setDailyOutput("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className={cn(careersTheme.card, "p-6 text-sm sm:p-8")}>
        <p className={cn("text-base font-semibold", careersTheme.heading)}>
          Application received
        </p>
        <p className={cn("mt-2", careersTheme.muted)}>
          Thank you. Stay active on Discord — we may contact you for a trial
          short-form edit. We review applications daily.
        </p>
      </div>
    );
  }

  return (
    <form className={careersTheme.formRoot} onSubmit={onSubmit}>
      <div className={cn(careersTheme.card, "space-y-4 p-5 sm:p-6")}>
        <h2 className={cn("text-xl font-bold tracking-tight", careersTheme.heading)}>
          Smart Short-Form Video Editor Application
        </h2>
        <p className={cn("text-sm italic", careersTheme.muted)}>
          This form takes around 2 minutes. TikTok / Reels / Shorts for SaaS and
          ecommerce brands on youry.io.
        </p>
        <div className={cn("space-y-3 text-sm", careersTheme.body)}>
          <p className="font-semibold text-white/90">Notes</p>
          <p>
            Please <strong className="text-white">DO NOT apply</strong> if you
            cannot edit short-form at a similar level to{" "}
            <a
              href={REFERENCE_EDIT_QUALITY_DRIVE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={careersTheme.link}
            >
              this reference folder
            </a>
            .
          </p>
          <p>
            DO NOT apply if you make multiple spelling mistakes in on-screen text
            on every video.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-white/70">
            <li>Sharp hooks in the first 3 seconds + trend-native pacing.</li>
            <li>Target: 3+ TikTok-ready edits per day when briefs are clear.</li>
            <li>Access to our paid community (Editor Kickstart+).</li>
            <li>We coach you and share all our training.</li>
            <li>
              <strong className="text-white">Good English is a MUST.</strong>
            </li>
          </ul>
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4">
            <p className="font-semibold text-violet-100">
              Unlimited earning opportunity
            </p>
            <p className="mt-2 text-white/75">
              Performance pay: <strong className="text-white">$500 per 500,000 views</strong>{" "}
              on content you edit. Post as often as you want —{" "}
              <strong className="text-white">no cap on volume</strong>. Strong
              short-form editors can scale earnings fast; the more you ship, the
              more you make.
            </p>
            <p className="mt-2 text-xs text-white/55">
              Style references:{" "}
              {EXAMPLE_TIKTOK_ACCOUNTS.map((acc, i) => (
                <span key={acc.url}>
                  {i > 0 ? " · " : null}
                  <a
                    href={acc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={careersTheme.link}
                  >
                    {acc.handle}
                  </a>
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="sf_full_name"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Full name
        </Label>
        <p className={cn("text-xs", careersTheme.hint)}>Apply with your full legal name.</p>
        <Input
          id="sf_full_name"
          name="full_name"
          required
          autoComplete="name"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="sf_phone"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Phone number
        </Label>
        <Input
          id="sf_phone"
          name="phone_number"
          type="tel"
          required
          autoComplete="tel"
          placeholder="Include country code"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="sf_location"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Where are you based? (location)
        </Label>
        <Input
          id="sf_location"
          name="location"
          required
          placeholder="City, country"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="sf_source"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Where did you find this application?
        </Label>
        <select
          id="sf_source"
          name="application_source"
          required
          defaultValue=""
          className={cn("min-h-11 w-full max-w-md rounded-md border px-3 text-sm", careersFormFieldClass)}
          onFocus={markStarted}
        >
          <option value="" disabled>
            Select option…
          </option>
          {APPLICATION_SOURCE_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="sf_email"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Email
        </Label>
        <Input
          id="sf_email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="sf_discord"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Discord username
        </Label>
        <p className={cn("text-xs", careersTheme.hint)}>
          Stay active on Discord so we can contact you for the trial edit.
        </p>
        <Input
          id="sf_discord"
          name="discord_username"
          required
          placeholder="@username"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-3">
        <Label className="after:ml-0.5 after:text-red-500 after:content-['*']">
          Rate your fluency in spoken/written English
        </Label>
        <div className="flex flex-wrap gap-2">
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setEnglishFluency(String(n));
                markStarted();
              }}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors",
                englishFluency === String(n)
                  ? careersTheme.choiceSelected
                  : careersTheme.choiceIdle,
              )}
              aria-pressed={englishFluency === String(n)}
            >
              <Star
                className={cn(
                  "size-4",
                  englishFluency === String(n) ? "fill-current" : "opacity-50",
                )}
                aria-hidden
              />
              {ENGLISH_FLUENCY_LABELS[n]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="sf_software"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          What editing software are you using?
        </Label>
        <p className={cn("text-xs", careersTheme.hint)}>
          We prefer Adobe Premiere Pro + After Effects. CapCut is fine if your
          output matches our bar.
        </p>
        <select
          id="sf_software"
          name="editing_software"
          required
          defaultValue=""
          className={cn("min-h-11 w-full max-w-md rounded-md border px-3 text-sm", careersFormFieldClass)}
          onFocus={markStarted}
        >
          <option value="" disabled>
            Select option…
          </option>
          {EDITING_SOFTWARE_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="sf_workflow"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Describe your short-form editing workflow
        </Label>
        <p className={cn("text-xs", careersTheme.hint)}>
          9:16 vertical, export settings, caption workflow, how fast you turn
          around a TikTok-ready cut, and whether you can deliver in 4K when needed.
        </p>
        <Textarea
          id="sf_workflow"
          name="short_form_workflow"
          required
          rows={4}
          className={cn("min-h-[100px] w-full resize-y", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="sf_income"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Average monthly income over the last 3 months
        </Label>
        <p className={cn("text-xs", careersTheme.hint)}>USD per month.</p>
        <Input
          id="sf_income"
          name="avg_monthly_income_usd"
          required
          placeholder="e.g. 2500"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="sf_hook"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          What matters most when editing short-form / TikTok videos?
        </Label>
        <p className={cn("text-xs", careersTheme.hint)}>
          Hooks, pacing, on-screen text, sound, retention — especially for SaaS /
          ecommerce accounts like our reference TikToks. Be specific.
        </p>
        <Textarea
          id="sf_hook"
          name="short_form_hook_priority"
          required
          rows={5}
          className={cn("min-h-[120px] w-full resize-y", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label className="after:ml-0.5 after:text-red-500 after:content-['*']">
          Daily output — can you sustain mass production?
        </Label>
        <p className={cn("text-xs", careersTheme.hint)}>
          We target 3+ polished short-form edits per day when briefs are clear.
        </p>
        <div className="space-y-2">
          {DAILY_OUTPUT_OPTIONS.map((opt) => (
            <label key={opt} className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="radio"
                name="daily_output_capacity"
                value={opt}
                checked={dailyOutput === opt}
                onChange={() => {
                  setDailyOutput(opt);
                  markStarted();
                }}
                required={!dailyOutput}
                className="mt-1 accent-violet-500"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="sf_trends"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          How do you spot and apply TikTok trends for SaaS / ecommerce?
        </Label>
        <p className={cn("text-xs", careersTheme.hint)}>
          Sounds, formats, hooks, and how you adapt them for brands like{" "}
          {EXAMPLE_TIKTOK_ACCOUNTS.map((a) => a.handle).join(" and ")}.
        </p>
        <Textarea
          id="sf_trends"
          name="tiktok_trends_approach"
          required
          rows={4}
          className={cn("min-h-[100px] w-full resize-y", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="sf_portfolio"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Portfolio — TikTok, Reels, or Drive with your best shorts
        </Label>
        <Input
          id="sf_portfolio"
          name="portfolio_social_url"
          type="url"
          required
          inputMode="url"
          placeholder="https://tiktok.com/@… or portfolio link"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sf_loom">Loom — why you are a good fit (optional)</Label>
        <p className={cn("text-xs", careersTheme.hint)}>
          Optional — can increase your chances (~3×).
        </p>
        <Input
          id="sf_loom"
          name="loom_fit_video_url"
          type="url"
          inputMode="url"
          placeholder="https://loom.com/share/…"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="sf_app_date">Application date (optional)</Label>
        <Input
          id="sf_app_date"
          name="application_date"
          type="date"
          className={cn("min-h-11 w-full max-w-xs", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <fieldset className={cn("space-y-3", careersTheme.privacyFieldset)}>
        <legend className="text-sm font-semibold after:ml-0.5 after:text-red-500 after:content-['*']">
          Privacy
        </legend>
        <p className={cn("text-xs", careersTheme.hint)}>
          I consent to Youry processing my data for this application. Contact{" "}
          <a href="mailto:careers@youry.io" className={careersTheme.link}>
            careers@youry.io
          </a>{" "}
          to withdraw.
        </p>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={privacy}
            onChange={(e) => {
              setPrivacy(e.target.checked);
              markStarted();
            }}
            className="mt-1 size-4 rounded border border-white/20 bg-white/[0.04] accent-violet-500"
          />
          <span>Yes, I understand.</span>
        </label>
      </fieldset>

      {error ? (
        <p className={cn("text-sm", careersTheme.error)} role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={submitting}
        className={cn("w-full rounded-xl sm:w-auto", careersTheme.btnPrimary)}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            Submitting…
          </>
        ) : (
          <>
            <Send className="mr-2 size-4" aria-hidden />
            Submit
          </>
        )}
      </Button>
    </form>
  );
}
