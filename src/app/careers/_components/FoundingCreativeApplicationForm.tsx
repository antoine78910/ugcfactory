"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { careersFormFieldClass, careersTheme } from "./careersTheme";
import {
  careersSessionMarkOnce,
  getCareersVisitorId,
  trackCareersEvent,
} from "@/lib/careers/trackClient";

type Props = {
  jobSlug: string;
};

export function FoundingCreativeApplicationForm({ jobSlug }: Props) {
  const startedRef = useRef(false);
  const [relocate, setRelocate] = useState<"" | "yes" | "no">("");
  const [privacy, setPrivacy] = useState(false);
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
    if (!relocate) {
      setError("Please select Yes or No for the relocation question.");
      return;
    }

    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("visitor_id", getCareersVisitorId());
    fd.set("job_slug", jobSlug);
    fd.set("privacy_accepted", privacy ? "true" : "false");
    fd.set("relocate_open", relocate);

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
      setRelocate("");
      setPrivacy(false);
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
          Thank you. We will review your answers and follow up by email if there
          is a fit.
        </p>
      </div>
    );
  }

  return (
    <form className={careersTheme.formRoot} onSubmit={onSubmit}>
      <div>
        <h2 className={cn("text-lg font-semibold", careersTheme.heading)}>
          Founding member
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label
            htmlFor="cc_first_name"
            className="after:ml-0.5 after:text-red-500 after:content-['*']"
          >
            First name
          </Label>
          <p className={cn("text-xs", careersTheme.hint)}>
            Include any middle name if you have it.
          </p>
          <Input
            id="cc_first_name"
            name="first_name"
            required
            autoComplete="given-name"
            placeholder="Type here…"
            className={cn("min-h-11 w-full", careersFormFieldClass)}
            onFocus={markStarted}
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="cc_last_name"
            className="after:ml-0.5 after:text-red-500 after:content-['*']"
          >
            Last name
          </Label>
          <Input
            id="cc_last_name"
            name="last_name"
            required
            autoComplete="family-name"
            placeholder="Type here…"
            className={cn("min-h-11 w-full", careersFormFieldClass)}
            onFocus={markStarted}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="cc_email"
          className="after:ml-0.5 after:text-red-500 after:content-['*']"
        >
          Email
        </Label>
        <Input
          id="cc_email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="hello@example.com"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cc_linkedin">LinkedIn URL</Label>
        <Input
          id="cc_linkedin"
          name="linkedin_url"
          type="url"
          inputMode="url"
          placeholder="https://…"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cc_twitter">X (Twitter) URL</Label>
        <Input
          id="cc_twitter"
          name="twitter_url"
          type="url"
          inputMode="url"
          placeholder="https://…"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cc_youtube">YouTube URL</Label>
        <Input
          id="cc_youtube"
          name="youtube_url"
          type="url"
          inputMode="url"
          placeholder="https://…"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cc_instagram">Instagram URL</Label>
        <p className={cn("text-xs", careersTheme.hint)}>Only if relevant.</p>
        <Input
          id="cc_instagram"
          name="instagram_url"
          type="url"
          inputMode="url"
          placeholder="https://…"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cc_tiktok">TikTok URL</Label>
        <p className={cn("text-xs", careersTheme.hint)}>Only if relevant.</p>
        <Input
          id="cc_tiktok"
          name="tiktok_url"
          type="url"
          inputMode="url"
          placeholder="https://…"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cc_portfolio">Portfolio / personal website / projects</Label>
        <p className={cn("text-xs", careersTheme.hint)}>
          Add as many links as you wish. Screenshots or short clips help us see
          what you did.
        </p>
        <Textarea
          id="cc_portfolio"
          name="portfolio"
          rows={4}
          placeholder="Type here…"
            className={cn("min-h-[100px] w-full resize-y", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cc_first_create">
          What is the first thing you would be excited to create?
        </Label>
        <p className={cn("text-xs", careersTheme.hint)}>
          Surprise us, a script, a teaser, stills from your favourite tool, a
          ten-second proof. Anything that genuinely excites you.
        </p>
        <Textarea
          id="cc_first_create"
          name="creative_first_create"
          rows={4}
          placeholder="Type here…"
            className={cn("min-h-[100px] w-full resize-y", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cc_salary">
          What are your annual gross salary expectations?
        </Label>
        <div className={cn("space-y-1 text-xs", careersTheme.hint)}>
          <p>
            We do not use this to anchor an offer, we lead with the strongest
            package we can. If expectations are far beyond our range, we prefer
            to respect your time.
          </p>
          <p>Annual gross, EUR.</p>
        </div>
        <Input
          id="cc_salary"
          name="salary_expectation_eur"
          placeholder="e.g. 65000"
          className={cn("min-h-11 w-full", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cc_inspiration">
          Give us a few examples of creative work you are inspired by or find
          beautiful.
        </Label>
        <p className={cn("text-xs", careersTheme.hint)}>
          Add as many as you want. Does not need to be startup-related.
        </p>
        <Textarea
          id="cc_inspiration"
          name="creative_inspiration"
          rows={4}
          placeholder="Type here…"
            className={cn("min-h-[100px] w-full resize-y", careersFormFieldClass)}
          onFocus={markStarted}
        />
      </div>

      <div className="space-y-3">
        <Label className="after:ml-0.5 after:text-red-500 after:content-['*']">
          Are you open to relocating or regular on-site collaboration in Europe
          if the role is a mutual fit?
        </Label>
        <div className={cn("space-y-1 text-xs", careersTheme.hint)}>
          <p>Assume you love the problem, the team, and what we are building.</p>
          <p>
            We are remote-first today. If relocation is not an option, still
            apply, we want to meet exceptional people first.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setRelocate("yes");
              markStarted();
            }}
            className={cn(
              "min-h-11 min-w-[88px] rounded-xl border px-4 text-sm font-medium transition-colors",
                relocate === "yes"
                  ? careersTheme.choiceSelected
                  : careersTheme.choiceIdle,
            )}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => {
              setRelocate("no");
              markStarted();
            }}
            className={cn(
              "min-h-11 min-w-[88px] rounded-xl border px-4 text-sm font-medium transition-colors",
                relocate === "no"
                  ? careersTheme.choiceSelected
                  : careersTheme.choiceIdle,
            )}
          >
            No
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cc_anything">Anything else you would like to add?</Label>
        <Textarea
          id="cc_anything"
          name="anything_else"
          rows={4}
          placeholder="Type here…"
            className={cn("min-h-[100px] w-full resize-y", careersFormFieldClass)}
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
          <a
            href="mailto:careers@youry.io"
            className={careersTheme.link}
          >
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
            Submit application
          </>
        )}
      </Button>
    </form>
  );
}
