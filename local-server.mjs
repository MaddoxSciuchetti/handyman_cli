import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { sanitizeSlug, writeCliPackage } from "./lib/cli-template.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const jobsRoot = path.join(projectRoot, "data", "jobs");
const generatedRoot = path.join(projectRoot, "generated");
const port = Number(process.env.LOCAL_API_PORT || 8788);
const allowedOrigin = process.env.APP_ORIGIN || "http://localhost:3000";

await Promise.all([
  mkdir(jobsRoot, { recursive: true }),
  mkdir(generatedRoot, { recursive: true }),
]);

const profileSchema = {
  type: "object",
  additionalProperties: false,
  required: ["business", "jobs", "areas", "availability", "contact"],
  properties: {
    business: {
      type: "object",
      additionalProperties: false,
      required: ["name", "website", "summary"],
      properties: {
        name: { type: "string" },
        website: { type: "string" },
        summary: { type: "string" },
      },
    },
    jobs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "description", "keywords", "pricing", "source"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          keywords: { type: "array", items: { type: "string" } },
          pricing: {
            type: "object",
            additionalProperties: false,
            required: [
              "type",
              "currency",
              "amount",
              "minimum",
              "maximum",
              "callOutFee",
            ],
            properties: {
              type: {
                type: "string",
                enum: ["fixed", "range", "quote_required"],
              },
              currency: { type: ["string", "null"] },
              amount: { type: ["number", "null"] },
              minimum: { type: ["number", "null"] },
              maximum: { type: ["number", "null"] },
              callOutFee: { type: ["number", "null"] },
            },
          },
          source: { type: "string", enum: ["website", "interview"] },
        },
      },
    },
    areas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "source"],
        properties: {
          name: { type: "string" },
          source: { type: "string", enum: ["website", "interview"] },
        },
      },
    },
    availability: {
      type: "object",
      additionalProperties: false,
      required: ["schedule", "emergency", "emergencyNotes", "source"],
      properties: {
        schedule: { type: ["string", "null"] },
        emergency: { type: "boolean" },
        emergencyNotes: { type: ["string", "null"] },
        source: { type: "string", enum: ["website", "interview"] },
      },
    },
    contact: {
      type: "object",
      additionalProperties: false,
      required: ["phone", "email", "website", "preferredMethod", "source"],
      properties: {
        phone: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        website: { type: "string" },
        preferredMethod: { type: ["string", "null"] },
        source: { type: "string", enum: ["website", "interview"] },
      },
    },
  },
};

function demoProfile(website) {
  const host = new URL(website).hostname.replace(/^www\./, "");
  const label = host
    .split(".")[0]
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return {
    business: {
      name: label || "Local Handyman",
      website,
      summary: "Local repair and maintenance services.",
    },
    jobs: [
      {
        id: "leak-repair",
        name: "Leak repair",
        description: "Diagnosis and repair of household water leaks.",
        keywords: ["leak", "pipe", "sink", "water"],
        pricing: {
          type: "quote_required",
          currency: "EUR",
          amount: null,
          minimum: null,
          maximum: null,
          callOutFee: null,
        },
        source: "website",
      },
      {
        id: "fixture-installation",
        name: "Fixture installation",
        description: "Installation and replacement of household fixtures.",
        keywords: ["fixture", "tap", "faucet", "sink"],
        pricing: {
          type: "quote_required",
          currency: "EUR",
          amount: null,
          minimum: null,
          maximum: null,
          callOutFee: null,
        },
        source: "website",
      },
    ],
    areas: [{ name: "Local service area", source: "website" }],
    availability: {
      schedule: null,
      emergency: false,
      emergencyNotes: null,
      source: "website",
    },
    contact: {
      phone: null,
      email: null,
      website,
      preferredMethod: "Phone",
      source: "website",
    },
  };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function send(response, status, body) {
  response.writeHead(status, corsHeaders());
  response.end(JSON.stringify(body));
}

async function parseBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function jobPath(id) {
  return path.join(jobsRoot, `${id}.json`);
}

async function getJob(id) {
  try {
    return JSON.parse(await readFile(jobPath(id), "utf8"));
  } catch {
    return null;
  }
}

async function saveJob(job) {
  job.updatedAt = new Date().toISOString();
  await writeFile(jobPath(job.id), `${JSON.stringify(job, null, 2)}\n`);
  return job;
}

function sameDomain(candidate, source) {
  try {
    return new URL(candidate).hostname.replace(/^www\./, "") ===
      new URL(source).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

async function octenSearch(website) {
  const key = process.env.OCTEN_API_KEY;
  if (!key) return { pages: [website], text: "", demo: true };
  const domain = new URL(website).hostname;
  const response = await fetch("https://api.octen.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify({
      query: `site:${domain} services pricing service area availability contact`,
      count: 8,
    }),
  });
  if (!response.ok) {
    throw new Error(`Octen Search returned ${response.status}.`);
  }
  const payload = await response.json();
  const results = payload?.data?.results || payload?.results || [];
  const pages = [
    website,
    ...results.map((item) => item.url).filter((url) => sameDomain(url, website)),
  ].filter((value, index, values) => values.indexOf(value) === index).slice(0, 5);
  const highlights = results
    .filter((item) => sameDomain(item.url, website))
    .map((item) => `${item.title || item.url}\n${item.highlight || ""}`)
    .join("\n\n");
  return { pages, text: highlights, demo: false };
}

function extractText(payload) {
  const candidates = [
    payload?.data?.content,
    payload?.data?.markdown,
    payload?.content,
    payload?.markdown,
  ];
  const array =
    payload?.data?.results || payload?.results || payload?.data?.pages || [];
  for (const item of array) {
    candidates.push(
      item?.full_content,
      item?.content,
      item?.markdown,
      item?.text,
      ...(item?.highlights || []),
    );
  }
  return candidates.filter((value) => typeof value === "string").join("\n\n");
}

async function octenExtract(pages) {
  const key = process.env.OCTEN_API_KEY;
  if (!key) return "";
  const endpoint = process.env.OCTEN_EXTRACT_URL || "https://api.octen.ai/extract";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify({ urls: pages }),
  });
  if (response.ok) return extractText(await response.json());

  const extracted = [];
  for (const url of pages) {
    const single = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({ url }),
    });
    if (single.ok) extracted.push(extractText(await single.json()));
  }
  if (!extracted.some(Boolean)) {
    throw new Error(`Octen Extract returned ${response.status}.`);
  }
  return extracted.join("\n\n");
}

function outputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const output of payload?.output || []) {
    for (const content of output?.content || []) {
      if (content?.type === "output_text" && content?.text) return content.text;
    }
  }
  return "";
}

async function normalizeWebsite(website, content) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return demoProfile(website);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "Extract a handyman business profile from website evidence. Do not invent jobs, prices, areas, hours, or contact details. Use quote_required when a price is absent. Every fact must use source website. Create short lowercase hyphenated job ids.",
        },
        {
          role: "user",
          content: `Website: ${website}\n\nExtracted website content:\n${content.slice(0, 90000)}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "business_profile",
          strict: true,
          schema: profileSchema,
        },
      },
    }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI returned ${response.status}: ${error.slice(0, 180)}`);
  }
  const profile = JSON.parse(outputText(await response.json()));
  profile.contact.website = website;
  return profile;
}

async function analyzeJob(job) {
  try {
    const search = await octenSearch(job.website);
    job.pages = search.pages;
    job.mode = search.demo || !process.env.OPENAI_API_KEY ? "demo" : "live";
    job.status = "extracting";
    await saveJob(job);
    let extracted = "";
    try {
      extracted = await octenExtract(search.pages);
    } catch (error) {
      job.mode = "demo";
      job.warning = error instanceof Error ? error.message : String(error);
    }
    const sourceText = [search.text, extracted].filter(Boolean).join("\n\n");
    job.profile = sourceText
      ? await normalizeWebsite(job.website, sourceText)
      : demoProfile(job.website);
    job.slug = sanitizeSlug(job.profile.business.name);
    job.status = "website_ready";
    await saveJob(job);
  } catch (error) {
    job.status = "error";
    job.error = error instanceof Error ? error.message : String(error);
    await saveJob(job);
  }
}

const interviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    businessName: { type: ["string", "null"] },
    jobs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: ["string", "null"] },
          accepted: { type: "boolean" },
          priceType: {
            type: "string",
            enum: ["fixed", "range", "quote_required"],
          },
          amount: { type: ["number", "null"] },
          minimum: { type: ["number", "null"] },
          maximum: { type: ["number", "null"] },
          callOutFee: { type: ["number", "null"] },
        },
        required: [
          "name",
          "description",
          "accepted",
          "priceType",
          "amount",
          "minimum",
          "maximum",
          "callOutFee",
        ],
      },
    },
    areas: { type: "array", items: { type: "string" } },
    schedule: { type: ["string", "null"] },
    emergency: { type: ["boolean", "null"] },
    emergencyNotes: { type: ["string", "null"] },
    preferredContact: { type: ["string", "null"] },
  },
  required: [
    "businessName",
    "jobs",
    "areas",
    "schedule",
    "emergency",
    "emergencyNotes",
    "preferredContact",
  ],
};

function interviewPrompt(profile) {
  return `You are onboarding a handyman business for an agent-readable CLI.
Say: "Hello, I am an AI interviewer. This call will be transcribed to create your business CLI. May I continue?"
If consent is declined, thank them and end the call.
Confirm or fill gaps in accepted jobs, rejected jobs, exact prices or price ranges, call-out fees, service areas, working hours, emergency availability, and preferred contact method.
Never suggest an answer. Ask one concise question at a time. Finish by summarizing the captured facts and ask for confirmation.
Known website profile:
${JSON.stringify(profile)}`;
}

async function startCall(job, phone) {
  if (!process.env.VAPI_API_KEY || !process.env.VAPI_PHONE_NUMBER_ID) {
    job.phone = phone;
    job.mode = "demo";
    job.status = "calling";
    await saveJob(job);
    setTimeout(async () => {
      const current = await getJob(job.id);
      if (!current || current.status !== "calling") return;
      mergeInterview(current, {
        jobs: [],
        areas: [],
        schedule: "Monday–Friday, 08:00–17:00",
        emergency: true,
        emergencyNotes: "Emergency requests are reviewed by phone.",
        preferredContact: "Phone",
      });
      current.status = "profile_ready";
      await saveJob(current);
    }, 2500);
    return job;
  }

  const publicBase = process.env.PUBLIC_BASE_URL;
  if (!publicBase) throw new Error("PUBLIC_BASE_URL is required for Vapi webhooks.");
  const response = await fetch("https://api.vapi.ai/call/phone", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: { number: phone },
      metadata: { jobId: job.id },
      assistant: {
        name: "Handyman onboarding",
        firstMessage:
          "Hello, I am an AI interviewer. This call will be transcribed to create your business CLI. May I continue?",
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: interviewPrompt(job.profile) }],
        },
        voice: { provider: "vapi", voiceId: "Elliot" },
        server: { url: `${publicBase.replace(/\/$/, "")}/api/vapi/webhook` },
        serverMessages: ["end-of-call-report", "status-update"],
        analysisPlan: {
          structuredDataPrompt:
            "Extract only facts stated or confirmed by the business owner.",
          structuredDataSchema: interviewSchema,
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Vapi returned ${response.status}: ${(await response.text()).slice(0, 180)}`);
  }
  const call = await response.json();
  job.phone = phone;
  job.callId = call.id;
  job.status = "calling";
  await saveJob(job);
  return job;
}

function mergeInterview(job, interview) {
  const profile = job.profile;
  if (interview.businessName) profile.business.name = interview.businessName;

  for (const answer of interview.jobs || []) {
    const id = sanitizeSlug(answer.name);
    const existingIndex = profile.jobs.findIndex(
      (item) => item.id === id || item.name.toLowerCase() === answer.name.toLowerCase(),
    );
    if (!answer.accepted) {
      if (existingIndex >= 0) profile.jobs.splice(existingIndex, 1);
      continue;
    }
    const existing = existingIndex >= 0 ? profile.jobs[existingIndex] : null;
    const next = {
      id,
      name: answer.name,
      description: answer.description || existing?.description || "Accepted job",
      keywords: existing?.keywords || answer.name.toLowerCase().split(/\W+/).filter(Boolean),
      pricing: {
        type: answer.priceType || existing?.pricing?.type || "quote_required",
        currency: "EUR",
        amount: answer.amount ?? existing?.pricing?.amount ?? null,
        minimum: answer.minimum ?? existing?.pricing?.minimum ?? null,
        maximum: answer.maximum ?? existing?.pricing?.maximum ?? null,
        callOutFee: answer.callOutFee ?? existing?.pricing?.callOutFee ?? null,
      },
      source: "interview",
    };
    if (existingIndex >= 0) profile.jobs[existingIndex] = next;
    else profile.jobs.push(next);
  }

  if (interview.areas?.length) {
    profile.areas = interview.areas.map((name) => ({ name, source: "interview" }));
  }
  if (
    interview.schedule != null ||
    interview.emergency != null ||
    interview.emergencyNotes != null
  ) {
    profile.availability = {
      schedule: interview.schedule ?? profile.availability.schedule,
      emergency: interview.emergency ?? profile.availability.emergency,
      emergencyNotes:
        interview.emergencyNotes ?? profile.availability.emergencyNotes,
      source: "interview",
    };
  }
  if (interview.preferredContact) {
    profile.contact.preferredMethod = interview.preferredContact;
    profile.contact.source = "interview";
  }
}

async function handleWebhook(body) {
  const message = body?.message || body;
  const call = message?.call || body?.call || {};
  const jobId =
    call?.metadata?.jobId ||
    message?.metadata?.jobId ||
    body?.metadata?.jobId;
  if (!jobId) return;
  const job = await getJob(jobId);
  if (!job) return;

  if (message.type === "status-update" && call.status) {
    job.callStatus = call.status;
    await saveJob(job);
    return;
  }
  if (message.type !== "end-of-call-report" && body?.type !== "call.ended") return;

  const structured =
    message?.analysis?.structuredData ||
    call?.analysis?.structuredData ||
    Object.values(call?.artifact?.structuredOutputs || {})[0]?.result ||
    {};
  mergeInterview(job, structured);
  job.callStatus = "ended";
  job.status = "profile_ready";
  job.transcript = message?.transcript || call?.transcript || null;
  await saveJob(job);
}

async function publishJob(job, requestedSlug) {
  const slug = sanitizeSlug(requestedSlug || job.slug);
  const packageInfo = await writeCliPackage({
    root: generatedRoot,
    slug,
    profile: job.profile,
  });
  let linked = false;
  let linkError = null;
  try {
    await execFileAsync("npm", ["link"], {
      cwd: packageInfo.directory,
      timeout: 30000,
    });
    linked = true;
  } catch (error) {
    linkError = error instanceof Error ? error.message : String(error);
  }

  const smoke = {};
  for (const args of [["help", "--json"], ["jobs", "--json"]]) {
    const { stdout } = await execFileAsync(
      process.execPath,
      [packageInfo.executable, ...args],
      { timeout: 10000 },
    );
    smoke[args[0]] = JSON.parse(stdout);
  }

  job.slug = slug;
  job.status = "published";
  job.publication = {
    linked,
    linkError,
    executable: packageInfo.executable,
    smoke,
  };
  await saveJob(job);
  return job;
}

const server = createServer(async (request, response) => {
  const requestOrigin = request.headers.origin;
  const isLocalOrigin =
    typeof requestOrigin === "string" &&
    /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(requestOrigin);
  const responseOrigin =
    requestOrigin === allowedOrigin || isLocalOrigin
      ? requestOrigin
      : allowedOrigin;
  response.setHeader("Access-Control-Allow-Origin", responseOrigin);
  response.setHeader("Vary", "Origin");

  if (request.method === "OPTIONS") return send(response, 204, {});

  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return send(response, 200, {
        ok: true,
        providers: {
          octen: Boolean(process.env.OCTEN_API_KEY),
          openai: Boolean(process.env.OPENAI_API_KEY),
          vapi: Boolean(process.env.VAPI_API_KEY && process.env.VAPI_PHONE_NUMBER_ID),
        },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/jobs") {
      const { website: rawWebsite } = await parseBody(request);
      const parsed = new URL(rawWebsite);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Website must use http or https.");
      }
      const job = {
        id: randomUUID(),
        website: parsed.toString(),
        status: "analyzing",
        createdAt: new Date().toISOString(),
      };
      await saveJob(job);
      analyzeJob(job);
      return send(response, 202, job);
    }

    if (request.method === "POST" && url.pathname === "/api/vapi/webhook") {
      await handleWebhook(await parseBody(request));
      return send(response, 200, { received: true });
    }

    const match = url.pathname.match(/^\/api\/jobs\/([^/]+)(?:\/(call|publish))?$/);
    if (match) {
      const job = await getJob(match[1]);
      if (!job) return send(response, 404, { error: "Job not found." });

      if (request.method === "GET" && !match[2]) {
        return send(response, 200, job);
      }
      if (request.method === "POST" && match[2] === "call") {
        const { phone } = await parseBody(request);
        if (!/^\+[1-9]\d{7,14}$/.test(phone || "")) {
          return send(response, 400, { error: "Use an E.164 phone number." });
        }
        return send(response, 200, await startCall(job, phone));
      }
      if (request.method === "POST" && match[2] === "publish") {
        const { slug } = await parseBody(request);
        return send(response, 200, await publishJob(job, slug));
      }
    }

    return send(response, 404, { error: "Not found." });
  } catch (error) {
    return send(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local API: http://127.0.0.1:${port}`);
});
