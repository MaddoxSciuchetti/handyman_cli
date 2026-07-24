"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Clipboard,
  Globe2,
  LoaderCircle,
  Phone,
  Terminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

const API_BASE =
  process.env.NEXT_PUBLIC_LOCAL_API_URL || "http://127.0.0.1:8788";

type Price = {
  type: "fixed" | "range" | "quote_required";
  currency: string | null;
  amount: number | null;
  minimum: number | null;
  maximum: number | null;
  callOutFee: number | null;
};

type BusinessProfile = {
  business: { name: string; website: string; summary: string };
  jobs: Array<{
    id: string;
    name: string;
    description: string;
    pricing: Price;
    source: "website" | "interview";
  }>;
  areas: Array<{ name: string; source: "website" | "interview" }>;
  availability: {
    schedule: string | null;
    emergency: boolean;
    emergencyNotes: string | null;
    source: "website" | "interview";
  };
  contact: {
    phone: string | null;
    email: string | null;
    website: string;
    preferredMethod: string | null;
    source: "website" | "interview";
  };
};

type Job = {
  id: string;
  website: string;
  status:
    | "analyzing"
    | "extracting"
    | "website_ready"
    | "calling"
    | "processing"
    | "profile_ready"
    | "published"
    | "error";
  mode?: "live" | "demo";
  profile?: BusinessProfile;
  slug?: string;
  error?: string;
  publication?: {
    linked: boolean;
    linkError: string | null;
    executable: string;
  };
};

type Stage =
  | "website"
  | "analysis"
  | "phone"
  | "calling"
  | "processing"
  | "profile"
  | "publishing"
  | "published";

function stageFromJob(job: Job | null, pending: Stage): Stage {
  if (pending === "publishing") return pending;
  if (!job) return "website";
  if (job.status === "analyzing" || job.status === "extracting") {
    return "analysis";
  }
  if (job.status === "website_ready") return "phone";
  if (job.status === "calling") return "calling";
  if (job.status === "processing") return "processing";
  if (job.status === "profile_ready") return "profile";
  if (job.status === "published") return "published";
  return pending;
}

const stepNumber: Record<Stage, number> = {
  website: 1,
  analysis: 1,
  phone: 2,
  calling: 2,
  processing: 2,
  profile: 3,
  publishing: 4,
  published: 4,
};

export default function Home() {
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("+49 ");
  const [job, setJob] = useState<Job | null>(null);
  const [pendingStage, setPendingStage] = useState<Stage>("website");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const stage = stageFromJob(job, pendingStage);

  const fetchJob = useCallback(async (id: string) => {
    const response = await fetch(`${API_BASE}/api/jobs/${id}`);
    if (!response.ok) return;
    const next = (await response.json()) as Job;
    setJob(next);
    if (next.slug) setSlug((current) => current || next.slug || "");
    if (next.status === "error") setError(next.error || "Processing failed.");
  }, []);

  useEffect(() => {
    if (
      !job ||
      !["analyzing", "extracting", "calling", "processing"].includes(job.status)
    ) {
      return;
    }
    const timer = window.setInterval(() => fetchJob(job.id), 1200);
    return () => window.clearInterval(timer);
  }, [fetchJob, job]);

  const progress = useMemo(() => {
    if (stage === "website") return 8;
    if (stage === "analysis") return job?.status === "extracting" ? 24 : 16;
    if (stage === "phone") return 42;
    if (stage === "calling") return 56;
    if (stage === "processing") return 66;
    if (stage === "profile") return 75;
    if (stage === "publishing") return 90;
    return 100;
  }, [job?.status, stage]);

  async function createJob(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const normalized = new URL(website);
      const response = await fetch(`${API_BASE}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website: normalized.toString() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Website analysis failed.");
      setJob(body);
      setPendingStage("analysis");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Enter a valid website URL.",
      );
    }
  }

  async function giveMeACall(event: FormEvent) {
    event.preventDefault();
    if (!job) return;
    setError("");
    const normalizedPhone = phone.replace(/[\s()-]/g, "");
    try {
      const response = await fetch(`${API_BASE}/api/jobs/${job.id}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Call failed.");
      setJob(body);
      setPendingStage("calling");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Call failed.");
    }
  }

  async function publishCli() {
    if (!job) return;
    setError("");
    setPendingStage("publishing");
    try {
      const response = await fetch(`${API_BASE}/api/jobs/${job.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Publication failed.");
      setJob(body);
      setPendingStage("published");
    } catch (cause) {
      setPendingStage("profile");
      setError(cause instanceof Error ? cause.message : "Publication failed.");
    }
  }

  async function copyCommand(command: string) {
    await navigator.clipboard.writeText(command);
    setCopied(command);
    window.setTimeout(() => setCopied(""), 1200);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-100 p-4 sm:p-8">
      <Card className="h-[min(640px,calc(100vh-2rem))] w-full max-w-[640px] overflow-hidden">
        <Progress value={progress} />
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-md bg-zinc-950 text-white">
              <Terminal className="size-4" strokeWidth={2} />
            </div>
            <span className="text-sm font-semibold tracking-[-0.01em]">
              Handyman CLI
            </span>
          </div>
          <div className="flex items-center gap-2">
            {job?.mode === "demo" && <Badge>Demo</Badge>}
            <Badge>Step {stepNumber[stage]} / 4</Badge>
          </div>
        </CardHeader>

        <CardContent className="overflow-y-auto">
          {stage === "website" && (
            <form
              className="flex h-full flex-col justify-center"
              onSubmit={createJob}
            >
              <Globe2 className="mb-8 size-8 text-zinc-950" strokeWidth={1.7} />
              <h1 className="text-4xl font-semibold tracking-[-0.045em] text-zinc-950">
                Business website
              </h1>
              <label
                className="mt-10 text-sm font-medium text-zinc-800"
                htmlFor="website"
              >
                Website URL
              </label>
              <Input
                id="website"
                className="mt-2"
                type="url"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://example.com"
                autoFocus
                required
              />
              {error && (
                <div className="mt-3 text-sm font-medium text-zinc-700">
                  {error}
                </div>
              )}
              <Button className="mt-5 w-full" type="submit">
                Analyze website
                <ArrowRight className="size-4" />
              </Button>
            </form>
          )}

          {stage === "analysis" && (
            <div
              className="flex h-full flex-col items-center justify-center text-center"
              aria-live="polite"
            >
              <LoaderCircle className="mb-8 size-9 animate-spin" strokeWidth={1.6} />
              <h1 className="text-4xl font-semibold tracking-[-0.045em]">
                Website analysis
              </h1>
              <div className="mt-10 grid w-full grid-cols-2 gap-3">
                <StatusCell
                  label="Search"
                  complete={job?.status === "extracting"}
                />
                <StatusCell label="Extract" complete={false} active />
              </div>
            </div>
          )}

          {stage === "phone" && job?.profile && (
            <form
              className="flex h-full flex-col justify-center"
              onSubmit={giveMeACall}
            >
              <Phone className="mb-8 size-8" strokeWidth={1.7} />
              <h1 className="text-4xl font-semibold tracking-[-0.045em]">
                Phone interview
              </h1>
              <div className="mt-8 flex flex-wrap gap-2">
                <Badge>{job.profile.jobs.length} jobs found</Badge>
                <Badge>{job.profile.areas.length} areas found</Badge>
              </div>
              <label
                className="mt-9 text-sm font-medium text-zinc-800"
                htmlFor="phone"
              >
                Phone number
              </label>
              <Input
                id="phone"
                className="mt-2"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
              {error && (
                <div className="mt-3 text-sm font-medium text-zinc-700">
                  {error}
                </div>
              )}
              <Button className="mt-5 w-full" type="submit">
                Give me a call
                <Phone className="size-4" />
              </Button>
            </form>
          )}

          {stage === "calling" && (
            <div
              className="flex h-full flex-col items-center justify-center text-center"
              aria-live="polite"
            >
              <div className="relative mb-8 grid size-20 place-items-center rounded-full border border-zinc-300">
                <div className="absolute inset-2 animate-ping rounded-full border border-zinc-300" />
                <Phone className="size-7" strokeWidth={1.7} />
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.045em]">
                Interview in progress
              </h1>
              <Badge className="mt-8">Call connected</Badge>
            </div>
          )}

          {stage === "processing" && (
            <div
              className="flex h-full flex-col items-center justify-center text-center"
              aria-live="polite"
            >
              <LoaderCircle className="mb-8 size-9 animate-spin" strokeWidth={1.6} />
              <h1 className="text-4xl font-semibold tracking-[-0.045em]">
                Processing interview
              </h1>
              <Badge className="mt-8">Call ended</Badge>
            </div>
          )}

          {stage === "profile" && job?.profile && (
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-semibold tracking-[-0.04em]">
                    Business profile
                  </h1>
                </div>
                <Badge>Ready</Badge>
              </div>

              <Separator className="my-6" />

              <div className="grid grid-cols-2 gap-3">
                <ProfileCell
                  label="Business"
                  value={job.profile.business.name}
                />
                <ProfileCell
                  label="Emergency"
                  value={job.profile.availability.emergency ? "Available" : "No"}
                />
              </div>

              <div className="mt-5">
                <div className="mb-2 text-sm font-medium">Accepted jobs</div>
                <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                  {job.profile.jobs.map((item) => (
                    <Badge key={item.id}>{item.name}</Badge>
                  ))}
                </div>
              </div>

              <label
                className="mt-6 block text-sm font-medium"
                htmlFor="slug"
              >
                CLI command
              </label>
              <div className="relative mt-2">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-zinc-400">
                  $
                </span>
                <Input
                  id="slug"
                  className="pl-9 font-mono"
                  value={slug}
                  onChange={(event) =>
                    setSlug(
                      event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, ""),
                    )
                  }
                />
              </div>
              {error && (
                <div className="mt-3 text-sm font-medium text-zinc-700">
                  {error}
                </div>
              )}
            </div>
          )}

          {stage === "publishing" && (
            <div
              className="flex h-full flex-col items-center justify-center text-center"
              aria-live="polite"
            >
              <LoaderCircle className="mb-8 size-9 animate-spin" strokeWidth={1.6} />
              <h1 className="text-4xl font-semibold tracking-[-0.045em]">
                Publishing CLI
              </h1>
              <Badge className="mt-8">npm link</Badge>
            </div>
          )}

          {stage === "published" && job?.publication && (
            <div>
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-semibold tracking-[-0.04em]">
                  CLI published
                </h1>
                <div className="grid size-9 place-items-center rounded-full bg-zinc-950 text-white">
                  <Check className="size-4" />
                </div>
              </div>
              <Separator className="my-6" />
              <div className="space-y-2">
                {[
                  `${job.slug} help`,
                  `${job.slug} jobs`,
                  `${job.slug} price "leak repair"`,
                  `${job.slug} areas`,
                  `${job.slug} availability`,
                  `${job.slug} contact`,
                ].map((command) => (
                  <button
                    className="group flex w-full items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-left font-mono text-sm hover:border-zinc-400"
                    key={command}
                    onClick={() => copyCommand(command)}
                    type="button"
                  >
                    <span>
                      <span className="mr-3 text-zinc-400">$</span>
                      {command}
                    </span>
                    {copied === command ? (
                      <Check className="size-4" />
                    ) : (
                      <Clipboard className="size-4 text-zinc-400 group-hover:text-zinc-950" />
                    )}
                  </button>
                ))}
              </div>
              {!job.publication.linked && (
                <div className="mt-4 rounded-md border border-zinc-300 p-3 font-mono text-xs text-zinc-700">
                  node {job.publication.executable} help
                </div>
              )}
            </div>
          )}
        </CardContent>

        {stage === "profile" && (
          <CardFooter>
            <Button className="w-full" onClick={publishCli} disabled={!slug}>
              Publish CLI
              <Terminal className="size-4" />
            </Button>
          </CardFooter>
        )}
      </Card>
    </main>
  );
}

function StatusCell({
  label,
  complete,
  active,
}: {
  label: string;
  complete: boolean;
  active?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-200 p-4 text-left">
      <span className="text-sm font-medium">{label}</span>
      {complete ? (
        <Check className="size-4" />
      ) : active ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <span className="size-2 rounded-full bg-zinc-300" />
      )}
    </div>
  );
}

function ProfileCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 p-4">
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
        {label}
      </div>
      <div className="mt-2 truncate text-sm font-medium">{value}</div>
    </div>
  );
}
