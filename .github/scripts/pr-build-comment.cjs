// Posts (or updates) a PR comment reporting the planner.xlsx build result.
// Invoked from .github/workflows/pr-build.yml via actions/github-script.
//
// The script is idempotent: it locates a prior bot comment by a hidden marker
// and edits it, so repeated pushes update one comment instead of spamming.

const fs = require('fs');

const MARKER = '<!-- pr-build-preview -->';

module.exports = async ({ github, context, core }) => {
  const success = process.env.BUILD_OUTCOME === 'success';
  const sha = context.payload.pull_request.head.sha;
  const shortSha = sha.substring(0, 7);
  const prNumber = context.payload.pull_request.number;
  const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;

  let body;
  if (success) {
    body =
      `${MARKER}\n` +
      `### ✅ Build succeeded\n\n` +
      `Built \`planner.xlsx\` for commit \`${shortSha}\`.\n\n` +
      `**[Download from the workflow run artifacts →](${runUrl})** ` +
      `(look for the \`planner-xlsx-pr-${prNumber}\` artifact; ` +
      `downloading requires being signed in to GitHub).`;
  } else {
    let log = '';
    try {
      log = fs.readFileSync('build.log', 'utf8');
    } catch {
      log = '(no build log captured)';
    }
    const lines = log.trimEnd().split('\n');
    const tail = lines.slice(-30).join('\n');
    body =
      `${MARKER}\n` +
      `### ❌ Build failed\n\n` +
      `\`planner.xlsx\` build failed for commit \`${shortSha}\`.\n\n` +
      `[View full logs →](${runUrl})\n\n` +
      `<details><summary>Build output (last ${Math.min(lines.length, 30)} lines)</summary>\n\n` +
      '```\n' +
      tail +
      '\n```\n\n' +
      `</details>`;
  }

  const { owner, repo } = context.repo;

  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: prNumber,
  });
  const existing = comments.find(
    (c) => c.user.type === 'Bot' && c.body.includes(MARKER),
  );

  if (existing) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    core.info(`Updated existing PR comment ${existing.id}`);
  } else {
    const created = await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
    core.info(`Created PR comment ${created.data.id}`);
  }
};
