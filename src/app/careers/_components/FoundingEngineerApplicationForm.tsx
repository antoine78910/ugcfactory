"use client";

import { useCallback, useRef, useState } from "react";
import { Wand2, Upload, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  careersSessionMarkOnce,
  getCareersVisitorId,
  trackCareersEvent,
} from "@/lib/careers/trackClient";

type Props = {
  jobSlug: string;
  headingClassName?: string;
};

export function FoundingEngineerApplicationForm({
  jobSlug,
  headingClassName,
}: Props) {
  const startedRef = useRef(false);
  const autofillRef = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<HTMLInputElement>(null);
  const [relocate, setRelocate] = useState<"" | "yes" | "no">("");
  const [privacy, setPrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resumeLabel, setResumeLabel] = useState<string | null>(null);

  const markStarted = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (careersSessionMarkOnce(`application_started_${jobSlug}`)) {
      void trackCareersEvent("application_started", jobSlug);
    }
  }, [jobSlug]);

  const onAutofillPick = (f: File | null) => {
    if (!f) return;
    setResumeLabel(f.name);
    if (resumeRef.current) {
      try {
        const dt = new DataTransfer();
        dt.items.add(f);
        resumeRef.current.files = dt.files;
      } catch {
        /* ignore */
      }
    }
    markStarted();
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!privacy) {
      setError("Please confirm the privacy notice.");
      return;
    }
    if (!relocate) {
      setError('Please select Yes or No for the relocation question.');
      return;
    }

    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("visitor_id", getCareersVisitorId());
    fd.set("job_slug", jobSlug);
    fd.set("privacy_accepted", privacy ? "true" : "false");
    fd.set("relocate_open", relocate);

    const resumeInput = resumeRef.current;
    if (resumeInput?.files?.length) {
      fd.set("resume", resumeInput.files[0]!);
    }

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
      setResumeLabel(null);
      if (resumeRef.current) resumeRef.current.value = "";
      if (autofillRef.current) autofillRef.current.value = "";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm sm:p-8">
        <p className="text-base font-semibold text-foreground">
          Application received
        </p>
        <p className="mt-2 text-muted-foreground">
          Thank you. We will review your answers and follow up by email if there
          is a fit.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-sm text-foreground">
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background shadow-sm">
            <Wand2 className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <h3 className="text-base font-semibold">Autofill from resume</h3>
            <p className="text-muted-foreground">
              Upload your resume here to attach it to your application. You still
              need to complete the fields below — we read every answer.
            </p>
            <input
              ref={autofillRef}
              type="file"
              accept=".pdf,.doc,.docx,.odt,.rtf,application/pdf"
              className="sr-only"
              tabIndex={-1}
              onChange={(ev) => {
                const f = ev.target.files?.[0] ?? null;
                onAutofillPick(f);
                ev.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => autofillRef.current?.click()}
            >
              <Upload className="mr-2 size-4" aria-hidden />
              Upload file
            </Button>
          </div>
        </div>
      </div>

      <form className="space-y-6" onSubmit={onSubmit}>
        <div>
          <h2
            className={cn(
              "text-lg font-semibold text-foreground",
              headingClassName,
            )}
          >
            Founding member
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="first_name" className="after:ml-0.5 after:text-red-500 after:content-['*']">
              First name
            </Label>
            <p className="text-xs text-muted-foreground">
              Include any middle name if you have it.
            </p>
            <Input
              id="first_name"
              name="first_name"
              required
              autoComplete="given-name"
              placeholder="Type here…"
              className="w-full min-h-11"
              onFocus={markStarted}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name" className="after:ml-0.5 after:text-red-500 after:content-['*']">
              Last name
            </Label>
            <Input
              id="last_name"
              name="last_name"
              required
              autoComplete="family-name"
              placeholder="Type here…"
              className="w-full min-h-11"
              onFocus={markStarted}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="after:ml-0.5 after:text-red-500 after:content-['*']">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="hello@example.com"
            className="w-full min-h-11"
            onFocus={markStarted}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="resume_file">Resume</Label>
          <p className="text-xs text-muted-foreground">
            Optional file attachment. You will still showcase your best work in the
            questions below.
          </p>
          <input
            ref={resumeRef}
            id="resume_file"
            type="file"
            accept=".pdf,.doc,.docx,.odt,.rtf,application/pdf,image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              setResumeLabel(f?.name ?? null);
              markStarted();
            }}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => resumeRef.current?.click()}
            >
              <Upload className="mr-2 size-4" aria-hidden />
              Upload file
            </Button>
            {resumeLabel ? (
              <span className="truncate text-xs text-muted-foreground">
                {resumeLabel}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                or drag and drop is not available — use the button
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linkedin_url">LinkedIn URL</Label>
          <Input
            id="linkedin_url"
            name="linkedin_url"
            type="url"
            inputMode="url"
            placeholder="https://…"
            className="w-full min-h-11"
            onFocus={markStarted}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="twitter_url" className="after:ml-0.5 after:text-red-500 after:content-['*']">
            X (Twitter) URL
          </Label>
          <Input
            id="twitter_url"
            name="twitter_url"
            type="url"
            required
            inputMode="url"
            placeholder="https://…"
            className="w-full min-h-11"
            onFocus={markStarted}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="github_url" className="after:ml-0.5 after:text-red-500 after:content-['*']">
            GitHub URL
          </Label>
          <Input
            id="github_url"
            name="github_url"
            type="url"
            required
            inputMode="url"
            placeholder="https://…"
            className="w-full min-h-11"
            onFocus={markStarted}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="built_created">What have you built and created?</Label>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>We prioritise real agency over credentials.</p>
            <p>Tell us anything you are proud of — multiple things welcome.</p>
            <p>
              A problem you solved, a site you shipped, infra you ran, events you
              hosted. If it does not fit a bucket, even better.
            </p>
          </div>
          <Textarea
            id="built_created"
            name="built_created"
            rows={4}
            placeholder="Type here…"
            className="min-h-[100px] w-full resize-y"
            onFocus={markStarted}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="portfolio">Portfolio / personal website / projects</Label>
          <p className="text-xs text-muted-foreground">
            Add as many links as you wish. Screenshots or short demos help us see
            what you did.
          </p>
          <Textarea
            id="portfolio"
            name="portfolio"
            rows={4}
            placeholder="Type here…"
            className="min-h-[100px] w-full resize-y"
            onFocus={markStarted}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="first_month_build">
            What would you be excited to build in the first month of work?
          </Label>
          <p className="text-xs text-muted-foreground">
            Our vision is to make AI UGC the default way ecommerce, SaaS, and app
            teams ship performance creative. What would you ship in month one that
            moves us closest? Be specific.
          </p>
          <Textarea
            id="first_month_build"
            name="first_month_build"
            rows={4}
            placeholder="Type here…"
            className="min-h-[100px] w-full resize-y"
            onFocus={markStarted}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="salary_expectation_eur">
            What are your annual gross salary expectations?
          </Label>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              We do not use this to anchor an offer — we always lead with the best
              package we can. If expectations are far beyond our range, we prefer to
              save your time.
            </p>
            <p>Annual gross, EUR.</p>
          </div>
          <Input
            id="salary_expectation_eur"
            name="salary_expectation_eur"
            placeholder="e.g. 85000"
            className="w-full min-h-11"
            onFocus={markStarted}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai_workflow">
            What is a workflow you have built for yourself?
          </Label>
          <p className="text-xs text-muted-foreground">
            Everyone prompts agents — what did you wire up to improve how you work?
            Orchestration, automation, a personal assistant pattern. Be specific.
          </p>
          <Textarea
            id="ai_workflow"
            name="ai_workflow"
            rows={4}
            placeholder="Type here…"
            className="min-h-[100px] w-full resize-y"
            onFocus={markStarted}
          />
        </div>

        <div className="space-y-3">
          <Label className="after:ml-0.5 after:text-red-500 after:content-['*']">
            Are you open to relocating or regular on-site collaboration in Europe
            if the role is a mutual fit?
          </Label>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Assume you love the problem, the team, and the trajectory.</p>
            <p>
              We are remote-first today. If relocation is not an option, still apply
              — we hire for exceptional people first.
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
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background hover:bg-muted",
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
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              No
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="anything_else">Anything else you would like to add?</Label>
          <Textarea
            id="anything_else"
            name="anything_else"
            rows={4}
            placeholder="Type here…"
            className="min-h-[100px] w-full resize-y"
            onFocus={markStarted}
          />
        </div>

        <fieldset className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <legend className="text-sm font-semibold after:ml-0.5 after:text-red-500 after:content-['*']">
            Privacy
          </legend>
          <p className="text-xs text-muted-foreground">
            I have read and understood the notice above. I consent to Youry
            collecting and processing my personal data to evaluate this job
            application. I can withdraw consent by contacting{" "}
            <a
              href="mailto:careers@youry.io"
              className="font-medium text-foreground underline underline-offset-4"
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
              className="mt-1 size-4 rounded border border-input"
            />
            <span>Yes, I understand.</span>
          </label>
        </fieldset>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={submitting}
          className="w-full rounded-xl sm:w-auto"
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
    </div>
  );
}
