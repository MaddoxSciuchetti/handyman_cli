import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function sanitizeSlug(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const executable = `#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const profile = JSON.parse(readFileSync(path.join(root, "..", "business.json"), "utf8"));
const args = process.argv.slice(2);
const jsonIndex = args.indexOf("--json");
const json = jsonIndex >= 0;
if (json) args.splice(jsonIndex, 1);
const command = args.shift() || "help";
const query = args.join(" ").trim();

const commands = [
  ["help", "List commands"],
  ["jobs", "List accepted jobs"],
  ["job \\"<job>\\"", "Show job details"],
  ["price \\"<job>\\"", "Show job pricing"],
  ["areas", "List service areas"],
  ["availability", "Show working hours"],
  ["contact", "Show contact options"],
  ["profile", "Show complete profile"],
];

function words(value) {
  return String(value || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function score(job, value) {
  const needle = new Set(words(value));
  return [job.name, ...(job.keywords || [])]
    .flatMap(words)
    .reduce((total, token) => total + (needle.has(token) ? 1 : 0), 0);
}

function findJob(value) {
  if (!value) return { job: null, suggestions: [] };
  const exact = profile.jobs.find((job) =>
    [job.id, job.name, ...(job.keywords || [])]
      .some((candidate) => String(candidate).toLowerCase() === value.toLowerCase())
  );
  if (exact) return { job: exact, suggestions: [] };
  const ranked = profile.jobs
    .map((job) => ({ job, score: score(job, value) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 1
    ? { job: ranked[0].job, suggestions: ranked.slice(1, 4).map((entry) => entry.job.name) }
    : { job: null, suggestions: profile.jobs.slice(0, 3).map((job) => job.name) };
}

function print(value, human) {
  if (json) {
    process.stdout.write(JSON.stringify(value, null, 2) + "\\n");
    return;
  }
  process.stdout.write(human + "\\n");
}

function priceText(pricing) {
  if (!pricing || pricing.type === "quote_required") return "Quote required";
  if (pricing.type === "fixed") return \`\${pricing.currency || "EUR"} \${pricing.amount}\`;
  if (pricing.type === "range") {
    return \`\${pricing.currency || "EUR"} \${pricing.minimum}–\${pricing.maximum}\`;
  }
  return "Quote required";
}

if (command === "help") {
  print(
    { business: profile.business.name, commands: commands.map(([usage, description]) => ({ usage, description })) },
    [profile.business.name, "", ...commands.map(([usage, description]) => \`  \${profile.command} \${usage.padEnd(24)} \${description}\`)].join("\\n"),
  );
} else if (command === "jobs") {
  print(
    { jobs: profile.jobs },
    profile.jobs.length
      ? profile.jobs.map((job) => \`\${job.name}\\n  \${job.description || "Accepted job"}\`).join("\\n\\n")
      : "No accepted jobs listed",
  );
} else if (command === "job" || command === "price") {
  const result = findJob(query);
  if (!result.job) {
    print(
      { found: false, query, suggestions: result.suggestions },
      \`Job not found\${result.suggestions.length ? \`\\nTry: \${result.suggestions.join(", ")}\` : ""}\`,
    );
    process.exitCode = 2;
  } else if (command === "job") {
    print(
      { found: true, job: result.job, suggestions: result.suggestions },
      [result.job.name, result.job.description || "Accepted job", \`Price: \${priceText(result.job.pricing)}\`, \`Source: \${result.job.source}\`].join("\\n"),
    );
  } else {
    print(
      { found: true, job: result.job.name, pricing: result.job.pricing, source: result.job.source },
      \`\${result.job.name}\\n\${priceText(result.job.pricing)}\${result.job.pricing?.callOutFee ? \`\\nCall-out fee: \${result.job.pricing.currency || "EUR"} \${result.job.pricing.callOutFee}\` : ""}\`,
    );
  }
} else if (command === "areas") {
  print(
    { areas: profile.areas },
    profile.areas.length ? profile.areas.map((area) => area.name).join("\\n") : "Service area not listed",
  );
} else if (command === "availability") {
  print(
    profile.availability,
    [profile.availability.schedule || "Availability not listed", \`Emergency service: \${profile.availability.emergency ? "Yes" : "No"}\`, profile.availability.emergencyNotes].filter(Boolean).join("\\n"),
  );
} else if (command === "contact") {
  print(
    profile.contact,
    Object.entries(profile.contact)
      .filter(([key, value]) => value && key !== "source")
      .map(([key, value]) => \`\${key}: \${value}\`)
      .join("\\n") || "Contact information not listed",
  );
} else if (command === "profile") {
  print(
    profile,
    [profile.business.name, profile.business.summary, profile.business.website, \`\${profile.jobs.length} accepted jobs\`, \`\${profile.areas.length} service areas\`].filter(Boolean).join("\\n"),
  );
} else {
  print(
    { error: "unknown_command", command, available: commands.map(([usage]) => usage.split(" ")[0]) },
    \`Unknown command: \${command}\\nRun: \${profile.command} help\`,
  );
  process.exitCode = 2;
}
`;

export async function writeCliPackage({ root, slug, profile }) {
  const command = sanitizeSlug(slug);
  if (!command || command.length < 2) {
    throw new Error("Command must contain at least two letters or numbers.");
  }

  const directory = path.join(root, command);
  await mkdir(path.join(directory, "bin"), { recursive: true });

  const business = {
    ...profile,
    command,
    generatedAt: new Date().toISOString(),
  };
  const packageJson = {
    name: `local-${command}-cli`,
    version: "1.0.0",
    private: true,
    type: "module",
    bin: { [command]: "./bin/cli.js" },
  };
  const readme = `# ${profile.business.name}\n\n## Commands\n\n\`\`\`sh\n${command} help\n${command} jobs\n${command} job "job name"\n${command} price "job name"\n${command} areas\n${command} availability\n${command} contact\n${command} profile\n\`\`\`\n\nAdd \`--json\` to any command for machine-readable output.\n`;

  await Promise.all([
    writeFile(
      path.join(directory, "package.json"),
      `${JSON.stringify(packageJson, null, 2)}\n`,
    ),
    writeFile(
      path.join(directory, "business.json"),
      `${JSON.stringify(business, null, 2)}\n`,
    ),
    writeFile(path.join(directory, "README.md"), readme),
    writeFile(path.join(directory, "bin", "cli.js"), executable, {
      mode: 0o755,
    }),
  ]);

  return { command, directory, executable: path.join(directory, "bin", "cli.js") };
}
