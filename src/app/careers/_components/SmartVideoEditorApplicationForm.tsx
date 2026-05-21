"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CONTENT_TYPE_OPTIONS,
  EDITING_EXPERIENCE_OPTIONS,
  EDITING_SOFTWARE_OPTIONS,
  FAST_DEADLINE_OPTIONS,
  LONG_TERM_OPTIONS,
  MASS_PRODUCTION_OPTIONS,
  PERFORMANCE_PAYMENT_OPTIONS,
  TIKTOK_TRENDS_OPTIONS,
} from "@/lib/careers/videoEditorApplication";
import { careersFormFieldClass, careersTheme } from "./careersTheme";
import {
  careersSessionMarkOnce,
  getCareersVisitorId,
  trackCareersEvent,
} from "@/lib/careers/trackClient";

type Props = {
  jobSlug: string;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className={cn("border-t border-white/10 pt-6 text-base font-semibold", careersTheme.heading)}>
      {children}
    </h3>
  );
}

function CheckboxGroup({
  name,
  options,
  otherName,
  required,
  onFocus,
}: {
  name: string;
  options: readonly string[];
  otherName?: string;
  required?: boolean;
  onFocus?: () => void;
}) {
  const [otherChecked, setOtherChecked] = useState(false);
  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <label key={opt} className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            name={name}
            value={opt}
            required={required ? false : undefined}
            className="mt-1 size-4 rounded border border-white/20 bg-white/[0.04] accent-violet-500"
            onFocus={onFocus}
          />
          <span>{opt}</span>
        </label>
      ))}
      {otherName ? (
        <>
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              name={name}
              value="other"
              checked={otherChecked}
              onChange={(e) => setOtherChecked(e.target.checked)}
              className="mt-1 size-4 rounded border border-white/20 bg-white/[0.04] accent-violet-500"
              onFocus={onFocus}
            />
            <span>Other</span>
          </label>
          {otherChecked ? (
            <Input
              name={otherName}
              placeholder="Please type another option here"
              className={cn("min-h-11 w-full max-w-md", careersFormFieldClass)}
              onFocus={onFocus}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function RadioGroup({
  name,
  options,
  value,
  onChange,
  onFocus,
}: {
  name: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <label key={opt} className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="radio"
            name={name}
            value={opt}
            checked={value === opt}
            onChange={() => onChange(opt)}
            required
            className="mt-1 size-4 accent-violet-500"
            onFocus={onFocus}
          />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
}

function YesNoButtons({
  value,
  onChange,
  onFocus,
}: {
  value: "" | "Yes" | "No";
  onChange: (v: "Yes" | "No") => void;
  onFocus?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(["Yes", "No"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => {
            onChange(opt);
            onFocus?.();
          }}
          className={cn(
            "min-h-11 min-w-[88px] rounded-xl border px-4 text-sm font-medium transition-colors",
            value === opt ? careersTheme.choiceSelected : careersTheme.choiceIdle,
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function SmartVideoEditorApplicationForm({ jobSlug }: Props) {
  const startedRef = useRef(false);
  const [privacy, setPrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [workedForCreators, setWorkedForCreators] = useState<"" | "Yes" | "No">("");
  const [availableImmediately, setAvailableImmediately] = useState<"" | "Yes" | "No">("");
  const [editingTest, setEditingTest] = useState<"" | "Yes" | "No">("");
  const [fastDeadlines, setFastDeadlines] = useState("");
  const [performancePayment, setPerformancePayment] = useState("");
  const [longTerm, setLongTerm] = useState("");
  const [tiktokTrends, setTiktokTrends] = useState("");
  const [massProduction, setMassProduction] = useState("");

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
    if (!workedForCreators) {
      setError("Please answer if you worked for creators or brands.");
      return;
    }
    if (!availableImmediately) {
      setError("Please answer availability.");
      return;
    }
    if (!editingTest) {
      setError("Please answer about the editing test.");
      return;
    }
    if (!fastDeadlines) {
      setError("Please answer about fast deadlines.");
      return;
    }
    if (!performancePayment) {
      setError("Please answer about performance-based payment.");
      return;
    }
    if (!longTerm) {
      setError("Please answer about long-term collaboration.");
      return;
    }
    if (!tiktokTrends) {
      setError("Please answer about TikTok trends.");
      return;
    }
    if (!massProduction) {
      setError("Please answer about daily output (3+ videos).");
      return;
    }

    const form = e.currentTarget;
    const softwareChecked = form.querySelectorAll<HTMLInputElement>(
      'input[name="editing_software"]:checked',
    );
    if (softwareChecked.length === 0) {
      setError("Select at least one editing software.");
      return;
    }
    const contentChecked = form.querySelectorAll<HTMLInputElement>(
      'input[name="content_types"]:checked',
    );
    if (contentChecked.length === 0) {
      setError("Select at least one content type.");
      return;
    }

    const fd = new FormData(form);
    fd.set("visitor_id", getCareersVisitorId());
    fd.set("job_slug", jobSlug);
    fd.set("privacy_accepted", privacy ? "true" : "false");
    fd.set("worked_for_creators", workedForCreators);
    fd.set("available_immediately", availableImmediately);
    fd.set("editing_test", editingTest);
    fd.set("fast_deadlines", fastDeadlines);
    fd.set("performance_payment_ok", performancePayment);
    fd.set("long_term_collaboration", longTerm);
    fd.set("tiktok_trends_comfort", tiktokTrends);
    fd.set("mass_production_3_per_day", massProduction);

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
      setWorkedForCreators("");
      setAvailableImmediately("");
      setEditingTest("");
      setFastDeadlines("");
      setPerformancePayment("");
      setLongTerm("");
      setTiktokTrends("");
      setMassProduction("");
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
          Thank you. We review TikTok-ready editors daily and will reach out on
          Discord, Telegram, or email if there is a fit.
        </p>
      </div>
    );
  }

  return (
    <form className={careersTheme.formRoot} onSubmit={onSubmit}>
      <div>
        <h2 className={cn("text-lg font-semibold", careersTheme.heading)}>
          Smart Video Editor — TikTok &amp; trends
        </h2>
        <p className={cn("mt-2 text-sm", careersTheme.muted)}>
          Fill out the form to join our content team. We ship mass-production
          edits for SaaS and ecommerce brands (dropship.io / pinecode style) —
          minimum 3 TikTok-ready videos per day.
        </p>
      </div>

      <SectionTitle>Personal information</SectionTitle>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label
            htmlFor="ve_first_name"
            className="after:ml-0.5 after:text-red-500 after:content-['*']"
          >
            First name
          </Label>
          <Input
            id="ve_first_name"
            name="first_name"
            required
            autoComplete="given-name"
            className={cn("min-h-11 w-full", careersFormFieldClass)}
            onFocus={markStarted}
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="ve_last_name"
            className="after:ml-0.5 after:text-red-500 after:content-['*']"
          >
            Last name
          </Label>
          <Input
            id="ve_last_name"
            name="last_name"
            required
            autoComplete="family-name"
            className={cn("min-h-11 w-full", careersFormFieldClass)}
            onFocus={markStarted}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="ve_email"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Email
        </Label>
        <Input
          id="ve_email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="hello@example.com"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label
            htmlFor="ve_age"
            className="after:ml-0.5 after:text-red-500 after:content-['*']"
          >
            Age
          </Label>
          <Input
            id="ve_age"
            name="age"
            type="number"
            min={16}
            max={80}
            required
            placeholder="e.g. 23"
            className={cn("min-h-11 w-full", careersFormFieldClass)}
            onFocus={markStarted}
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="ve_country"
            className="after:ml-0.5 after:text-red-500 after:content-['*']"
          >
            Country / time zone
          </Label>
          <Input
            id="ve_country"
            name="country_timezone"
            required
            placeholder="e.g. France (CET)"
            className={cn("min-h-11 w-full", careersFormFieldClass)}
            onFocus={markStarted}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="ve_discord"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Discord or Telegram username
        </Label>
        <Input
          id="ve_discord"
          name="discord_telegram"
          required
          placeholder="@username"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="ve_portfolio"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Link to your portfolio, Drive, TikTok, or Instagram
        </Label>
        <Input
          id="ve_portfolio"
          name="portfolio_link"
          type="url"
          required
          inputMode="url"
          placeholder="https://…"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <SectionTitle>Experience</SectionTitle>

      <div className="space-y-2">
        <Label
          htmlFor="ve_experience"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          How long have you been editing videos?
        </Label>
        <select
          id="ve_experience"
          name="editing_experience"
          required
          className={cn(
            "min-h-11 w-full max-w-md rounded-md border px-3 text-sm",
            careersFormFieldClass,
          )}
          onFocus={markStarted}
          defaultValue=""
        >
          <option value="" disabled>
            Please select
          </option>
          {EDITING_EXPERIENCE_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label className="after:ml-0.5 after:text-red-500 after:content-['*']">
          Which editing software do you use?
        </Label>
        <CheckboxGroup
          name="editing_software"
          options={EDITING_SOFTWARE_OPTIONS}
          otherName="editing_software_other"
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-3">
        <Label className="after:ml-0.5 after:text-red-500 after:content-['*']">
          Have you worked for creators or brands before?
        </Label>
        <YesNoButtons
          value={workedForCreators}
          onChange={setWorkedForCreators}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="ve_best_edits"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Send your 3 best edits (Drive, YouTube, TikTok links)
        </Label>
        <Textarea
          id="ve_best_edits"
          name="best_edits_links"
          required
          rows={5}
          placeholder="One link per line…"
          className={cn("min-h-[120px] w-full resize-y", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label className="after:ml-0.5 after:text-red-500 after:content-['*']">
          What type of content do you edit best?
        </Label>
        <CheckboxGroup
          name="content_types"
          options={CONTENT_TYPE_OPTIONS}
          otherName="content_types_other"
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="ve_saas_style"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Experience with SaaS / ecommerce TikTok (dropship.io, pinecode style)
        </Label>
        <p className={cn("text-xs", careersTheme.hint)}>
          Describe accounts, niches, or example edits. Hook-first, trend-native,
          product-demo pacing.
        </p>
        <Textarea
          id="ve_saas_style"
          name="saas_dropship_style_experience"
          required
          rows={4}
          className={cn("min-h-[100px] w-full resize-y", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <SectionTitle>Productivity</SectionTitle>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label
            htmlFor="ve_videos_day"
            className="after:ml-0.5 after:text-red-500 after:content-['*']"
          >
            How many videos can you edit per day (on average)?
          </Label>
          <Input
            id="ve_videos_day"
            name="videos_per_day"
            type="number"
            min={1}
            max={30}
            required
            placeholder="e.g. 5"
            className={cn("min-h-11 w-full", careersFormFieldClass)}
            onFocus={markStarted}
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="ve_hours_day"
            className="after:ml-0.5 after:text-red-500 after:content-['*']"
          >
            How many hours per day can you work?
          </Label>
          <Input
            id="ve_hours_day"
            name="hours_per_day"
            type="number"
            min={1}
            max={16}
            required
            placeholder="e.g. 8"
            className={cn("min-h-11 w-full", careersFormFieldClass)}
            onFocus={markStarted}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="after:ml-0.5 after:text-red-500 after:content-['*']">
          Can you sustain mass production (3+ TikTok-ready edits per day)?
        </Label>
        <RadioGroup
          name="mass_production_3_per_day"
          options={MASS_PRODUCTION_OPTIONS}
          value={massProduction}
          onChange={setMassProduction}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label className="after:ml-0.5 after:text-red-500 after:content-['*']">
          How do you stay on top of TikTok trends for SaaS / ecommerce?
        </Label>
        <RadioGroup
          name="tiktok_trends_comfort"
          options={TIKTOK_TRENDS_OPTIONS}
          value={tiktokTrends}
          onChange={setTiktokTrends}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label className="after:ml-0.5 after:text-red-500 after:content-['*']">
          Are you comfortable with fast deadlines?
        </Label>
        <RadioGroup
          name="fast_deadlines"
          options={FAST_DEADLINE_OPTIONS}
          value={fastDeadlines}
          onChange={setFastDeadlines}
          onFocus={markStarted}
        />
      </div>

      <SectionTitle>Creativity</SectionTitle>

      <div className="space-y-2">
        <Label
          htmlFor="ve_viral"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          In your opinion, what makes a video go viral?
        </Label>
        <Textarea
          id="ve_viral"
          name="viral_opinion"
          required
          rows={5}
          className={cn("min-h-[120px] w-full resize-y", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="ve_hook"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          How do you capture attention in the first 3 seconds?
        </Label>
        <Textarea
          id="ve_hook"
          name="hook_first_3_seconds"
          required
          rows={5}
          className={cn("min-h-[120px] w-full resize-y", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <SectionTitle>Motivation</SectionTitle>

      <div className="space-y-2">
        <Label
          htmlFor="ve_why_youry"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Why do you want to join Youry?
        </Label>
        <Textarea
          id="ve_why_youry"
          name="why_join_youry"
          required
          rows={5}
          className={cn("min-h-[120px] w-full resize-y", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="ve_why_you"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Why should we choose you?
        </Label>
        <Textarea
          id="ve_why_you"
          name="why_choose_you"
          required
          rows={5}
          className={cn("min-h-[120px] w-full resize-y", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <SectionTitle>Payment &amp; availability</SectionTitle>

      <div className="space-y-3">
        <Label className="after:ml-0.5 after:text-red-500 after:content-['*']">
          Are you available immediately?
        </Label>
        <YesNoButtons
          value={availableImmediately}
          onChange={setAvailableImmediately}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-3">
        <Label className="after:ml-0.5 after:text-red-500 after:content-['*']">
          Would you be willing to complete an editing test?
        </Label>
        <YesNoButtons value={editingTest} onChange={setEditingTest} onFocus={markStarted} />
      </div>

      <div className="space-y-2">
        <Label className="after:ml-0.5 after:text-red-500 after:content-['*']">
          Performance-based payment: $1 per 1,000 views generated — are you okay
          with that?
        </Label>
        <RadioGroup
          name="performance_payment_ok"
          options={PERFORMANCE_PAYMENT_OPTIONS}
          value={performancePayment}
          onChange={setPerformancePayment}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label className="after:ml-0.5 after:text-red-500 after:content-['*']">
          Are you looking for a long-term collaboration?
        </Label>
        <RadioGroup
          name="long_term_collaboration"
          options={LONG_TERM_OPTIONS}
          value={longTerm}
          onChange={setLongTerm}
          onFocus={markStarted}
        />
      </div>

      <fieldset className={cn("space-y-3", careersTheme.privacyFieldset)}>
        <legend className="text-sm font-semibold after:ml-0.5 after:text-red-500 after:content-['*']">
          Privacy
        </legend>
        <p className={cn("text-xs", careersTheme.hint)}>
          I have read and understood the notice above. I consent to Youry
          collecting and processing my personal data to evaluate this job
          application. I can withdraw consent by contacting{" "}
          <a href="mailto:careers@youry.io" className={careersTheme.link}>
            careers@youry.io
          </a>
          .
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
            Submit my application
          </>
        )}
      </Button>
    </form>
  );
}
