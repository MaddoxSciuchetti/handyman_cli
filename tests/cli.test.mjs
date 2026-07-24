import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { writeCliPackage } from "../lib/cli-template.mjs";

const execFileAsync = promisify(execFile);

const profile = {
  business: {
    name: "Mitte Handwerk",
    website: "https://example.com",
    summary: "Repairs in Berlin.",
  },
  jobs: [
    {
      id: "leak-repair",
      name: "Leak repair",
      description: "Household leak repair.",
      keywords: ["leak", "pipe", "sink"],
      pricing: {
        type: "range",
        currency: "EUR",
        amount: null,
        minimum: 80,
        maximum: 160,
        callOutFee: 30,
      },
      source: "interview",
    },
    {
      id: "door-repair",
      name: "Door repair",
      description: "Door adjustment and repair.",
      keywords: ["door", "hinge"],
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
  areas: [{ name: "Berlin Mitte", source: "interview" }],
  availability: {
    schedule: "Monday–Friday, 08:00–17:00",
    emergency: true,
    emergencyNotes: "Call first",
    source: "interview",
  },
  contact: {
    phone: "+491234567890",
    email: null,
    website: "https://example.com",
    preferredMethod: "Phone",
    source: "interview",
  },
};

async function runCli(executable, ...args) {
  return execFileAsync(process.execPath, [executable, ...args]);
}

test("generated CLI supports the fixed command catalog", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "handyman-cli-"));
  const generated = await writeCliPackage({
    root,
    slug: "mitte-handwerk",
    profile,
  });

  const help = JSON.parse(
    (await runCli(generated.executable, "help", "--json")).stdout,
  );
  assert.equal(help.business, "Mitte Handwerk");
  assert.ok(help.commands.some((command) => command.usage === "jobs"));

  const jobs = JSON.parse(
    (await runCli(generated.executable, "jobs", "--json")).stdout,
  );
  assert.equal(jobs.jobs.length, 2);

  const price = JSON.parse(
    (await runCli(generated.executable, "price", "leaking sink", "--json"))
      .stdout,
  );
  assert.equal(price.found, true);
  assert.equal(price.pricing.minimum, 80);

  const quote = JSON.parse(
    (await runCli(generated.executable, "price", "door repair", "--json"))
      .stdout,
  );
  assert.equal(quote.pricing.type, "quote_required");

  const areas = JSON.parse(
    (await runCli(generated.executable, "areas", "--json")).stdout,
  );
  assert.equal(areas.areas[0].name, "Berlin Mitte");
});
