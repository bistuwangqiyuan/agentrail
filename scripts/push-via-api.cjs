const { execSync } = require("child_process");
const fs = require("fs");

const token = execSync("gh auth token", { encoding: "utf8" }).trim();
const repo = "bistuwangqiyuan/agentrail";
const branch = "main";

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "agentrail-push",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

async function rest(pathname, init) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "agentrail-push",
      ...(init && init.headers),
    },
  });
  if (!res.ok) throw new Error(`${pathname} ${res.status} ${await res.text()}`);
  return res.json();
}

(async () => {
  const ref = await rest(`/repos/${repo}/git/ref/heads/${branch}`);
  let head = ref.object.sha;
  console.log("remote HEAD", head);

  let files = execSync("git diff --name-only origin/main...HEAD", { encoding: "utf8" })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  if (!files.length) {
    files = execSync('git show --name-only --pretty="" HEAD', { encoding: "utf8" })
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
  }

  const uncommitted = execSync("git status --porcelain", { encoding: "utf8" })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.slice(3).trim().replace(/^.* -> /, ""));

  const all = [...new Set([...files, ...uncommitted])];
  console.log("files", all.length, all);

  const additions = [];
  const deletions = [];
  for (const f of all) {
    if (!fs.existsSync(f)) {
      deletions.push(f.replace(/\\/g, "/"));
      continue;
    }
    const buf = fs.readFileSync(f);
    if (buf.length > 3_500_000) {
      console.warn("skip large", f, buf.length);
      continue;
    }
    additions.push({ path: f.replace(/\\/g, "/"), contents: buf.toString("base64") });
  }

  const msg = execSync("git log -1 --pretty=%s", { encoding: "utf8" }).trim();
  const chunkSize = 15;

  for (let i = 0; i < additions.length; i += chunkSize) {
    const chunk = additions.slice(i, i + chunkSize);
    const isLast = i + chunkSize >= additions.length;
    const data = await gql(
      `mutation($input: CreateCommitOnBranchInput!) {
        createCommitOnBranch(input: $input) {
          commit { oid url }
        }
      }`,
      {
        input: {
          branch: {
            repositoryNameWithOwner: repo,
            branchName: branch,
          },
          message: {
            headline:
              i === 0 && isLast
                ? msg
                : `${msg} (${Math.floor(i / chunkSize) + 1})`,
          },
          expectedHeadOid: head,
          fileChanges: {
            additions: chunk,
            deletions: isLast ? deletions.map((p) => ({ path: p })) : [],
          },
        },
      },
    );
    head = data.createCommitOnBranch.commit.oid;
    console.log("committed", head, "chunk", chunk.length, data.createCommitOnBranch.commit.url);
  }

  console.log("DONE remote HEAD", head);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
